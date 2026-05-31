# 口袋记账群晖 NAS 新手部署指南

本文按“只给自己长期使用”的方式写：数据保存在群晖 `/volume1/docker/pocket-ledger/data`，配置保存在 `/volume1/docker/pocket-ledger/config/.env`，代码和临时构建内容可以随时替换，数据库不跟代码混在一起。

## 1. 部署前确认

你需要准备：

- 群晖 DSM 已安装 **Container Manager**。
- 群晖已开启 SSH。路径：控制面板 -> 终端机和 SNMP -> 启用 SSH。
- Windows 本机已经有 Docker，可以先在本机验证，也可以让群晖自己构建镜像。
- 不建议把服务直接暴露到公网。长期使用建议通过局域网、Tailscale、ZeroTier、WireGuard 或群晖自带 VPN 访问。

默认访问端口：

- 容器内部端口：`3000`
- 群晖对外端口：`3456`
- 访问地址示例：`http://群晖IP:3456`

## 2. 群晖目录规划

在群晖上创建这些目录：

```sh
# 应用总目录，后续所有文件都放这里，便于迁移和备份
mkdir -p /volume1/docker/pocket-ledger

# 持久化数据目录，数据库、备份、上传文件都在这里
mkdir -p /volume1/docker/pocket-ledger/data

# 环境配置目录，保存 .env，不能上传 GitHub
mkdir -p /volume1/docker/pocket-ledger/config

# 代码目录，如果从 GitHub 拉取或上传压缩包，放到这里
mkdir -p /volume1/docker/pocket-ledger/app
```

推荐最终结构：

```text
/volume1/docker/pocket-ledger/
  app/                 # 项目代码，可删除重放，不保存真实账务数据
  config/.env          # 生产环境配置，包含登录初始密码和 SESSION_SECRET
  data/app.db          # SQLite 主数据库，最重要
  data/backups/        # 应用内备份文件
  data/uploads/        # 导入时的临时上传文件
  docker-compose.yml   # 群晖部署编排文件
```

## 3. 准备生产配置

在群晖创建 `/volume1/docker/pocket-ledger/config/.env`：

```sh
cat > /volume1/docker/pocket-ledger/config/.env <<'EOF'
# 固定为 production，表示用生产模式运行
APP_ENV=production

# 容器内部监听端口，除非改 Dockerfile，否则保持 3000
APP_PORT=3000

# 改成你的群晖实际访问地址。IP 和端口要和浏览器访问一致
APP_URL=http://192.168.1.10:3456

# 数据库放在容器内 /data/app.db；/data 会映射到群晖 data 目录
DATABASE_URL=file:/data/app.db

# 会话签名密钥，至少 24 位。请改成随机长字符串，不要用示例值
SESSION_SECRET=replace-with-a-long-random-string-at-least-24-chars

# 初始管理员账号。第一次登录后系统会要求改密码
ADMIN_USERNAME=admin
ADMIN_INITIAL_PASSWORD=change-me-on-first-login

# 备份和上传目录，保持 /data 下即可
BACKUP_DIR=/data/backups
UPLOAD_DIR=/data/uploads

# 前端静态文件目录，Dockerfile 会把构建结果复制到这里
WEB_DIST_DIR=/app/public
EOF
```

改两个值：

- `APP_URL`：改成你的群晖 IP，例如 `http://192.168.31.20:3456`。
- `SESSION_SECRET`：改成长随机字符串。可以在 Windows PowerShell 生成：

```powershell
[guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
```

## 4. 准备代码

推荐方式：把 GitHub 私有仓库 clone 到群晖。

```sh
cd /volume1/docker/pocket-ledger

# 这里替换为你的私有仓库地址
git clone https://github.com/kailking/pocket-ledger.git app
```

如果群晖没有 `git`，也可以在 GitHub 下载 ZIP 后上传到 `/volume1/docker/pocket-ledger/app`，解压后保证 `package.json`、`Dockerfile`、`apps/` 在 `app` 目录第一层。

不要上传这些目录到群晖代码目录：

- `data/`
- `imports/`
- `screenshots/`
- `.env`
- `.codex_tmp/`
- `node_modules/`

这些已经在 `.gitignore` 和 `.dockerignore` 里排除。

## 5. 创建群晖 docker-compose.yml

在 `/volume1/docker/pocket-ledger/docker-compose.yml` 写入：

```yaml
services:
  pocket-ledger:
    # 从 app 目录里的 Dockerfile 构建镜像
    build:
      context: ./app

    # 镜像名，后续更新时会复用这个名字
    image: pocket-ledger:latest

    # 容器名，备份和恢复脚本会用到
    container_name: pocket-ledger

    # 群晖重启后自动启动；手动停止后不会反复拉起
    restart: unless-stopped

    ports:
      # 左边 3456 是群晖访问端口，右边 3000 是容器内部端口
      - "3456:3000"

    env_file:
      # 生产配置单独保存，不放进 GitHub
      - /volume1/docker/pocket-ledger/config/.env

    environment:
      # 这些值再声明一次，避免 .env 漏配导致路径跑偏
      APP_ENV: "production"
      APP_PORT: "3000"
      DATABASE_URL: "file:/data/app.db"
      BACKUP_DIR: "/data/backups"
      UPLOAD_DIR: "/data/uploads"
      WEB_DIST_DIR: "/app/public"

    volumes:
      # 群晖 data 目录映射进容器 /data，数据库会持久保存
      - /volume1/docker/pocket-ledger/data:/data
```

## 6. 用 SSH 构建并启动

登录群晖 SSH 后执行：

```sh
cd /volume1/docker/pocket-ledger

# 第一次启动：构建镜像并后台运行
docker compose up -d --build

# 查看容器状态，看到 healthy 或 running 就正常
docker compose ps

# 查看日志，如果启动失败，先看这里
docker compose logs -f pocket-ledger
```

浏览器访问：

```text
http://群晖IP:3456
```

第一次登录：

- 用户名：`config/.env` 里的 `ADMIN_USERNAME`
- 初始密码：`config/.env` 里的 `ADMIN_INITIAL_PASSWORD`
- 登录后立即修改密码。

## 7. 用 Container Manager 图形界面启动

如果你更想用图形界面：

1. 打开 Container Manager。
2. 进入“项目”。
3. 创建项目。
4. 项目名称填 `pocket-ledger`。
5. 路径选择 `/volume1/docker/pocket-ledger`。
6. 选择“使用现有 docker-compose.yml”。
7. 粘贴或选择上面的 `docker-compose.yml`。
8. 启动项目。

如果图形界面报构建失败，优先用 SSH 执行：

```sh
cd /volume1/docker/pocket-ledger
docker compose up -d --build
docker compose logs -f pocket-ledger
```

SSH 的日志更完整，方便定位是网络、依赖下载、权限还是配置问题。

## 8. 导入真实数据

建议顺序：

1. 先登录应用并修改初始密码。
2. 进入“更多 / 数据工具”。
3. 先手动创建一次备份。
4. 导入从口袋记账导出的表格。
5. 导入后检查首页、资产、报表、借贷。
6. 如果导入后发现账户重复，先不要删除，确认哪些是测试账户、哪些是真实导入账户后再处理。

数据库位置：

```text
/volume1/docker/pocket-ledger/data/app.db
```

只要这个文件还在，代码升级、容器重建都不会丢账。

## 9. 备份策略

应用内已经有定时备份设置，备份会落到：

```text
/volume1/docker/pocket-ledger/data/backups
```

建议再做一层群晖级备份：

- 用 Hyper Backup 定时备份 `/volume1/docker/pocket-ledger/data`。
- 备份目标可以是另一块硬盘、另一台 NAS、外接盘或云端。
- 最少保留最近 30 天，长期使用建议开启版本保留。

手动备份命令：

```sh
cd /volume1/docker/pocket-ledger/app

# 在正在运行的容器内创建 SQLite 在线备份
sh deploy/synology/backup.sh
```

备份完成后脚本会输出一个 `.db` 文件路径。

## 10. 恢复备份

恢复会先停止容器，把当前数据库复制到 `pre-restore-*` 安全目录，然后替换 `app.db`。

```sh
cd /volume1/docker/pocket-ledger/app

# 把路径换成你要恢复的备份文件
DATA_DIR=/volume1/docker/pocket-ledger/data \
sh deploy/synology/restore.sh /volume1/docker/pocket-ledger/data/backups/app-20260601T120000Z.db
```

恢复后启动：

```sh
cd /volume1/docker/pocket-ledger
docker compose up -d
docker compose logs -f pocket-ledger
```

## 11. 更新应用

从 GitHub 更新：

```sh
cd /volume1/docker/pocket-ledger/app

# 拉取最新代码
git pull

cd /volume1/docker/pocket-ledger

# 重新构建镜像并重启容器
docker compose up -d --build
```

更新前建议先备份：

```sh
cd /volume1/docker/pocket-ledger/app
sh deploy/synology/backup.sh
```

## 12. 迁移到新群晖

迁移时只需要带走三类内容：

- `/volume1/docker/pocket-ledger/data`
- `/volume1/docker/pocket-ledger/config/.env`
- GitHub 里的项目代码，或 `/volume1/docker/pocket-ledger/app`

新群晖上按本文重新创建目录，把 `data` 和 `.env` 放回同样路径，再执行：

```sh
cd /volume1/docker/pocket-ledger
docker compose up -d --build
```

## 13. 常见问题

### 页面打不开

检查容器是否运行：

```sh
cd /volume1/docker/pocket-ledger
docker compose ps
docker compose logs -f pocket-ledger
```

检查访问地址是否和 `.env` 的 `APP_URL` 一致，例如都用 `http://192.168.1.10:3456`。

### 登录后经常掉线

确认 `SESSION_SECRET` 固定不变。不要每次部署都生成新的 `SESSION_SECRET`，否则旧 cookie 会全部失效。

### 数据不见了

先不要重建或清空。检查群晖数据目录：

```sh
ls -lah /volume1/docker/pocket-ledger/data
```

重点看 `app.db` 是否还在，以及容器 compose 的 volume 是否仍然映射到 `/volume1/docker/pocket-ledger/data:/data`。

### 构建很慢

群晖 CPU 通常比电脑弱，第一次构建会慢。后续只要 `package-lock.json` 没大变，Docker 会复用缓存。

### 想换端口

只改 compose 里的左侧端口：

```yaml
ports:
  - "4567:3000"
```

同时把 `.env` 的 `APP_URL` 改成：

```text
APP_URL=http://群晖IP:4567
```

然后重启：

```sh
docker compose up -d
```

## 14. 长期使用建议

- 不要把 `data/`、`.env`、导入表格、截图上传 GitHub。
- 每次大量导入、删除账户、清空数据前，先创建备份。
- 定期下载一份 `data/backups` 到电脑或外接盘。
- 不要直接编辑 `app.db`，除非已经备份并且知道 SQL 后果。
- 如果开放公网访问，必须加反向代理 HTTPS、强密码、VPN 或访问控制；更推荐不开放公网。
