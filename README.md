# 口袋记账风格个人记账系统

一个面向群晖 NAS 私有部署的个人记账 PWA。目标是保留口袋记账 iOS 端的高效率记账体验，同时提供自有数据、可迁移、可维护的前后端实现。

## 技术结构

- `apps/web`：React + Vite + PWA 移动端界面
- `apps/api`：Fastify + SQLite 后端 API
- `packages/shared`：前后端共享类型和常量
- `deploy/synology`：群晖 Container Manager 部署文件、备份脚本、恢复脚本
- `docs`：产品定版、开发、部署文档

## 本地开发

本机需要 Node.js 22+ 和 npm 11+。

```bash
npm install
cp .env.example .env
npm run dev:api
npm run dev:web
```

后端默认是 `http://localhost:3000`，前端默认是 `http://localhost:5173`。

## 本地构建

```bash
npm run build
```

本地 Docker 镜像：

```bash
npm run docker:build
```

本地 Docker Compose：

```bash
npm run docker:config
npm run docker:up
```

默认访问 `http://localhost:3456`，数据挂载到 `./data`。

## 群晖部署

运行方式：

- 镜像：`pocket-ledger:latest`
- 容器端口：`3000`
- NAS 默认访问端口：`3456`
- 容器数据目录：`/data`
- NAS 数据目录：`/volume1/docker/pocket-ledger/data`
- SQLite：`/volume1/docker/pocket-ledger/data/app.db`
- 备份目录：`/volume1/docker/pocket-ledger/data/backups`
- 上传目录：`/volume1/docker/pocket-ledger/data/uploads`

详细步骤见 [docs/群晖部署说明.md](docs/群晖部署说明.md)。

## 常用文档

- [开发运行说明](docs/开发运行说明.md)
- [群晖部署说明](docs/群晖部署说明.md)
- [口袋记账 APP 定版文档](docs/口袋记账APP定版文档.md)
