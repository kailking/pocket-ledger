# 口袋记账风格个人记账系统定版文档

版本：v0.1 定版草案  
日期：2026-05-31  
部署目标：群晖 NAS / Container Manager  
使用对象：单人自用

## 1. 项目定位

本项目目标是开发一个高仿「口袋记账」iOS 使用体验、但拥有自有视觉和自主管理能力的个人记账系统。

它不是简单复制原 App，而是复刻其高效率记账方式、账单时间轴、分类统计、账户资产、借入借出、预算等核心使用逻辑，并针对 NAS 私有部署、数据迁移、长期维护进行优化。

最终形态为移动端优先的 Web/PWA App：

- iPhone Safari 打开后可添加到主屏幕，接近原生 App 使用体验。
- 后端服务和数据库运行在群晖 Container Manager。
- 数据库存放在 NAS 挂载目录，便于备份、迁移、恢复。
- 支持从口袋记账导出的 `.xls` 文件导入历史数据。

## 2. 已分析资料

### 2.1 导出数据

文件：

- `imports/pocket-ledger-export.xlsx`

格式判断：

- 真实 Excel 旧格式 `.xls`，不是伪装成 `.xls` 的 CSV/HTML。

工作表：

| 工作表 | 数据量 | 用途 |
| --- | ---: | --- |
| 收支记录 | 15717 条 | 主账单流水 |
| 借入借出 | 80 条 | 借贷/应收应付记录 |
| 固收理财 | 仅表头 | 暂不开发，数据库预留 |

主账单时间范围：

- `2016-08-13` 至 `2026-03-01`

主字段：

| 字段 | 说明 |
| --- | --- |
| 时间 | 账单日期 |
| 收支类型 | 收入 / 支出 |
| 账目分类 | 分类名称，也包含转账、余额变更、借入借出等特殊分类 |
| 金额 | 支出为负数，收入为正数 |
| 账户 | 账户名称 |
| 账户类型 | 网络账户、储蓄卡、现金、投资账户等 |
| 账本 | 默认账本、公司账本、矿机 |
| 成员 | 可选成员 |
| 备注 | 备注文本 |

账本：

- `默认账本`
- `公司账本`
- `矿机`

账户类型：

- 网络账户
- 储蓄卡
- 现金
- 投资账户
- 蚂蚁花呗
- 信用卡
- 京东白条
- 微信钱包

### 2.2 截图资料

已分析目录：

- 本地截图目录
- 本地补充截图目录

已覆盖页面：

- 首页账单时间轴
- 记一笔：收入、支出、转账
- 金额键盘
- 日期选择
- 账户选择
- 成员选择
- 备注输入
- 报表：分类、趋势、对比、成员
- 账户详情
- 账户编辑
- 资产 / 负债
- 计入资产账户选择
- 借入借出 / 应收账
- 新建借贷
- 收款
- 收款记录
- 分类管理
- 分类新增 / 修改 / 删除
- 预算
- 预算设置
- 子分类预算

暂缓模块：

- 项目独立管理
- 报销独立管理
- 社区
- 主题皮肤商城
- VIP 相关功能
- 图片附件

## 3. 第一版范围

### 3.1 必做

第一版必须完成以下功能：

- 登录保护，单人使用。
- 账单首页，按日期时间轴展示。
- 新增、编辑、删除收入。
- 新增、编辑、删除支出。
- 新增、编辑、删除转账。
- 账户列表、账户详情、账户编辑。
- 资产 / 负债视图。
- 选择哪些账户计入净资产。
- 分类管理：收入分类、支出分类。
- 报表统计：分类、趋势、对比。
- 借入借出 / 应收应付。
- 预算基础功能。
- 账单搜索和筛选。
- 口袋记账 `.xls` 导入。
- 数据备份、恢复、导出。
- 群晖 Container Manager 部署。

### 3.2 第一版可简化

这些功能数据库预留，但界面先做轻量：

- 多账本：保留字段，默认使用 `默认账本`。
- 成员：记账时可选，统计页可按成员筛选。
- 项目：先不做独立项目模块，保留 `project_id` 和备注分析空间。
- 标签：先不做复杂标签系统，保留表结构。
- 附件：先不上传图片，保留附件表。
- 固收理财：先导入表结构，不做完整业务。

### 3.3 不做

第一版明确不做：

- 社区内容。
- VIP 付费。
- 第三方同步。
- 多人协作。
- 银行卡自动拉取流水。
- 原口袋记账品牌、Logo、素材复制。

## 4. 产品结构

底部主导航：

1. 资产
2. 报表
3. 账单 / 记一笔
4. 借贷
5. 更多

与口袋记账相比，做一个轻微调整：

- 原 App 底部中间是 `+` 记账入口。
- 本项目底部中间仍保持醒目的 `+`。
- 首页默认可以是账单时间轴；资产页作为独立主 Tab。
- 在移动端，打开 App 后默认进入账单首页。

## 5. 页面定版

### 5.1 账单首页

目标：

- 快速看本月收入、支出、预算剩余。
- 按时间轴查看每日流水。
- 快速进入新增记账。

页面元素：

- 顶部账本选择。
- 当前月入口。
- 本月收入。
- 本月支出。
- 月预算剩余。
- 日期时间轴。
- 每日收入/支出小结。
- 账单项：图标、分类、备注、金额。
- 底部导航。

交互：

- 点击账单：进入账单详情。
- 左滑账单：显示删除、编辑。
- 点击顶部日期：切换月份。
- 点击 `+`：打开记一笔。

优化：

- 增加搜索入口。
- 增加筛选入口。
- 支持按备注、分类、账户、金额、日期筛选。

### 5.2 记一笔

记账页采用底部键盘 + 上方分类网格结构。

顶部：

- 分段控件：收入 / 支出 / 转账。
- 关闭按钮。
- 当前分类。
- 当前金额。

主体：

- 分类圆形图标网格。
- 支出分类和收入分类分开管理。
- 分类编辑入口。

底部：

- 日期按钮。
- 账户按钮。
- 成员按钮。
- 备注按钮。
- 数字键盘。
- 确定按钮。

金额键盘：

- `7 8 9 backspace`
- `4 5 6 +`
- `1 2 3 -`
- `C 0 . 确定`

金额规则：

- 支出保存为负数。
- 收入保存为正数。
- 转账保存为一组转出/转入记录。
- UI 显示始终使用正数金额，类型决定方向。

### 5.3 转账

字段：

- 金额。
- 转出账户。
- 转入账户。
- 日期。
- 备注。
- 账本。

保存逻辑：

- 创建一条 `transfer` 主记录。
- 创建两条关联流水：
  - 转出账户：支出，金额为负数。
  - 转入账户：收入，金额为正数。
- 分类统一为 `转账`。

导入兼容：

- 口袋记账导出中的转账是两条普通流水。
- 导入时按日期、金额绝对值、分类 `转账`、一正一负进行配对。
- 配对成功后生成 `transfer_group_id`。
- 未配对成功的记录保留为普通流水，并标记 `import_warning`。

### 5.4 账单详情

字段展示：

- 类型：收入 / 支出 / 转账 / 余额变更 / 借贷。
- 金额。
- 分类。
- 账户。
- 日期。
- 成员。
- 账本。
- 备注。
- 导入来源。

操作：

- 编辑。
- 删除。
- 复制一笔。

删除规则：

- 删除普通流水只删除单条记录。
- 删除转账时提示是否删除整组转账。
- 删除借贷关联流水时提示会影响借贷余额。

### 5.5 搜索与筛选

口袋记账原 App 没有明显搜索筛选，本项目增加。

筛选条件：

- 关键词：分类、备注、账户、成员。
- 日期范围。
- 金额范围。
- 收支类型。
- 分类。
- 账户。
- 账本。
- 成员。
- 是否转账。
- 是否余额变更。
- 是否借贷关联。

搜索结果：

- 仍使用账单列表样式。
- 顶部显示合计收入、支出、净额。
- 可导出筛选结果。

### 5.6 报表

Tab：

- 分类
- 趋势
- 对比
- 成员

分类报表：

- 支出 / 收入切换。
- 月份切换。
- 环形图。
- 分类排行。
- 点击分类进入明细。

趋势报表：

- 年份切换。
- 收入 / 支出 / 结余切换。
- 折线图。
- 月度表格。

对比报表：

- 按分类展示最近几个月对比。
- 显示笔数、累计金额、月均消费。

成员报表：

- 按成员聚合收入、支出。
- 第一版可简化为列表统计。

统计规则：

- 普通收入计入收入。
- 普通支出计入支出。
- 转账不计入收入支出报表，但影响账户余额。
- 余额变更默认不计入消费报表，但影响账户余额。
- 借入/借出是否计入收支由类型决定，默认单独在借贷模块统计。

### 5.7 资产

资产页分为：

- 资产账户。
- 负债账户。

账户字段：

- 账户名称。
- 账户类型。
- 当前余额。
- 初始余额。
- 颜色。
- 图标。
- 是否计入资产。
- 是否隐藏。
- 是否归档。

账户类型：

- 现金
- 储蓄卡
- 支付宝
- 微信钱包
- 网络账户
- 投资账户
- 信用卡
- 花呗
- 京东白条
- 应收账
- 应付账
- 自定义

应收账在资产页中按“应收分组 / 应收账簿”汇总展示：

- 每个应收分组生成一个虚拟资产账户，例如“应收账”“项目应收”等。
- 分组可单独设置是否计入资产；设置为不计入时，资产页隐藏该虚拟账户，借贷页默认也不显示该分组的未完成应收明细。
- 老数据导入和历史借贷记录默认归入系统默认分组“应收账”，后续可新建多个分组承接不同应收总账。

资产计算：

- 资产总额 = 计入资产的资产账户余额合计。
- 负债总额 = 计入资产的负债账户余额合计。
- 净资产 = 资产总额 - 负债总额。

账户余额计算：

- 当前余额 = 初始余额 + 该账户全部流水金额合计。
- 余额变更是特殊流水，直接影响账户余额。
- 转账同时影响两个账户余额，但不影响收支报表。

### 5.8 借入借出 / 应收应付

模块名称：

- UI 可叫 `借贷`。
- 内部模型叫 `loans`。

业务类型：

- 借出：别人欠我钱，应收。
- 收款：别人还我钱，减少应收。
- 借入：我欠别人钱，应付。
- 还款：我还别人钱，减少应付。

账户影响口径：

- 借出 / 追加借出：所选账户余额减少。
- 收款 / 利息收入：所选账户余额增加。
- 借入 / 追加借入：所选账户余额增加。
- 还款 / 利息支出：所选账户余额减少。
- 借贷产生的账户流水统一记为 `transactions.type = loan`，并关联 `loan_id`。
- 借贷流水影响账户余额，但不进入普通收入、普通支出、预算和分类报表，避免把资金往来误算成消费或收入。
- 手动结清只允许在剩余金额为 0 时执行；未结清金额必须先通过收款/还款流水处理。

列表：

- 未完成。
- 已结束。
- 对方名称。
- 金额。
- 剩余欠款。
- 最近记录。

新建字段：

- 对方名称。
- 借贷类型。
- 应收分组（仅借出/应收类记录需要选择）。
- 金额。
- 使用账户。
- 日期。
- 收款日 / 还款日。
- 提醒开关。
- 备注。

收款/还款字段：

- 金额。
- 利息收入 / 利息支出。
- 利息记录账本。
- 使用账户。
- 时间。
- 备注。

详情页：

- 顶部色块。
- 剩余欠款。
- 利息收入/支出。
- 应收/应付总额。
- 对方名称。
- 时间。
- 到期日。
- 使用账户。
- 备注。
- 收款/还款记录。
- 结束状态。

导入规则：

- `借入借出` 工作表作为主借贷数据来源。
- `收支记录` 中分类为 `借出`、`借入`、`收款`、`还款` 的记录作为账户流水。
- 导入时按日期、金额、对方、账户关联，避免重复计算。
- 导入的应收记录默认进入系统默认应收分组；如后续有多个应收总账，可在导入后通过借贷分组继续整理。

### 5.9 预算

第一版预算功能：

- 开启/关闭预算。
- 设置月总预算。
- 设置预算首页显示方式。
- 显示本月剩余预算。
- 分类预算作为后续增强项。

预算计算：

- 预算只统计支出。
- 默认排除转账、余额变更、借出、还款。
- 分类预算按支出分类聚合。

### 5.10 分类管理

分类分为：

- 支出分类。
- 收入分类。

字段：

- 名称。
- 类型。
- 图标。
- 颜色。
- 排序。
- 是否系统默认。
- 是否隐藏。
- 父分类。

交互：

- 列表编辑。
- 新增分类。
- 修改分类名称。
- 修改图标颜色。
- 删除分类。
- 记账页进入编辑态后显示删除按钮。

删除规则：

- 有历史账单的分类不硬删除，改为归档/隐藏。
- 无历史账单的分类可删除。

### 5.11 更多

页面入口：

- 数据导入。
- 数据备份。
- 数据导出。
- 分类管理。
- 预算设置。
- 账本管理。
- 成员管理。
- 设置。
- 关于。

第一版不放社区、VIP。

## 6. 数据库设计

数据库：

- SQLite。
- 文件路径通过环境变量配置。
- 推荐群晖挂载路径：`/data/app.db`。

### 6.1 users

单人使用，也保留用户表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | text | 主键 |
| username | text | 用户名 |
| password_hash | text | 密码哈希 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### 6.2 books

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | text | 主键 |
| name | text | 账本名 |
| is_default | boolean | 是否默认 |
| archived_at | datetime | 归档时间 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### 6.3 members

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | text | 主键 |
| name | text | 成员名 |
| archived_at | datetime | 归档时间 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### 6.4 accounts

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | text | 主键 |
| name | text | 账户名 |
| type | text | 账户类型 |
| kind | text | asset / liability |
| initial_balance | decimal | 初始余额 |
| current_balance_cache | decimal | 当前余额缓存 |
| currency | text | 默认 CNY |
| color | text | 颜色 |
| icon | text | 图标 |
| include_in_assets | boolean | 是否计入资产 |
| hidden | boolean | 是否隐藏 |
| archived_at | datetime | 归档时间 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### 6.5 categories

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | text | 主键 |
| name | text | 分类名 |
| type | text | income / expense |
| parent_id | text | 父分类 |
| icon | text | 图标 |
| color | text | 颜色 |
| sort_order | integer | 排序 |
| is_system | boolean | 是否系统分类 |
| hidden | boolean | 是否隐藏 |
| archived_at | datetime | 归档时间 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### 6.6 transactions

账单流水主表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | text | 主键 |
| type | text | income / expense / transfer_in / transfer_out / balance_adjustment / loan |
| happened_on | date | 日期 |
| amount | decimal | 带正负号金额 |
| display_amount | decimal | 正数显示金额 |
| account_id | text | 账户 |
| category_id | text | 分类 |
| book_id | text | 账本 |
| member_id | text | 成员 |
| note | text | 备注 |
| transfer_id | text | 转账组 |
| loan_id | text | 借贷主记录 |
| import_batch_id | text | 导入批次 |
| source_row_hash | text | 原始行哈希 |
| raw_payload | json | 原始导入数据 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |
| deleted_at | datetime | 软删除 |

金额规则：

- 支出为负数。
- 收入为正数。
- 转出为负数。
- 转入为正数。
- 余额变更按实际正负保存。

### 6.7 transfers

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | text | 主键 |
| happened_on | date | 日期 |
| amount | decimal | 正数金额 |
| from_account_id | text | 转出账户 |
| to_account_id | text | 转入账户 |
| note | text | 备注 |
| book_id | text | 账本 |
| import_batch_id | text | 导入批次 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |
| deleted_at | datetime | 软删除 |

### 6.8 loans

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | text | 主键 |
| direction | text | receivable / payable |
| loan_group_id | text | 借贷分组，历史数据为空时按 direction 回填默认分组 |
| counterparty | text | 对方名称 |
| principal_amount | decimal | 本金 |
| remaining_amount_cache | decimal | 剩余金额缓存 |
| interest_amount_cache | decimal | 利息缓存 |
| account_id | text | 使用账户 |
| happened_on | date | 日期 |
| due_on | date | 收款/还款日 |
| reminder_enabled | boolean | 是否提醒 |
| status | text | open / closed |
| note | text | 备注 |
| import_batch_id | text | 导入批次 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |
| closed_at | datetime | 结束时间 |
| deleted_at | datetime | 软删除 |

### 6.9 loan_groups

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | text | 主键 |
| name | text | 分组名称 |
| direction | text | receivable / payable |
| color | text | 分组颜色 |
| icon | text | 图标 |
| include_in_assets | boolean | 是否计入资产；应收分组关闭后资产页和借贷默认列表隐藏 |
| sort_order | integer | 排序 |
| is_default | boolean | 是否默认分组 |
| archived_at | datetime | 归档时间 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### 6.10 loan_entries

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | text | 主键 |
| loan_id | text | 借贷主记录 |
| type | text | principal / repayment / additional / interest |
| amount | decimal | 金额 |
| account_id | text | 使用账户 |
| book_id | text | 账本 |
| happened_on | date | 日期 |
| note | text | 备注 |
| transaction_id | text | 关联流水 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### 6.11 budgets

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | text | 主键 |
| month | text | YYYY-MM |
| total_amount | decimal | 月总预算 |
| enabled | boolean | 是否开启 |
| display_mode | text | 首页显示方式 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### 6.12 budget_categories

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | text | 主键 |
| budget_id | text | 预算 |
| category_id | text | 分类 |
| amount | decimal | 分类预算 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### 6.13 import_batches

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | text | 主键 |
| file_name | text | 文件名 |
| file_hash | text | 文件哈希 |
| source | text | pocket_accounting |
| status | text | pending / imported / failed |
| rows_total | integer | 总行数 |
| rows_success | integer | 成功行数 |
| rows_warning | integer | 警告行数 |
| rows_failed | integer | 失败行数 |
| summary | json | 导入摘要 |
| created_at | datetime | 创建时间 |

### 6.14 import_warnings

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | text | 主键 |
| import_batch_id | text | 导入批次 |
| sheet_name | text | 工作表 |
| row_number | integer | 行号 |
| level | text | warning / error |
| message | text | 问题说明 |
| raw_payload | json | 原始行 |
| created_at | datetime | 创建时间 |

## 7. 后端设计

推荐技术：

- Node.js + TypeScript。
- Fastify 或 NestJS。
- SQLite + Drizzle ORM 或 Prisma。
- Docker 单容器部署。

更推荐：

- Fastify + Drizzle + SQLite。

原因：

- 单人 NAS 部署更轻。
- 启动快。
- SQLite 迁移简单。
- 类型约束足够。

### 7.1 后端模块

| 模块 | 职责 |
| --- | --- |
| auth | 登录、密码、会话 |
| transactions | 收支流水 |
| transfers | 转账 |
| accounts | 账户和资产 |
| categories | 分类 |
| reports | 统计报表 |
| loans | 借入借出 |
| budgets | 预算 |
| imports | 口袋记账导入 |
| backups | 备份恢复 |
| settings | 设置 |

### 7.2 API 草案

认证：

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/change-password`

账单：

- `GET /api/transactions`
- `GET /api/transactions/:id`
- `POST /api/transactions`
- `PUT /api/transactions/:id`
- `DELETE /api/transactions/:id`
- `POST /api/transactions/:id/duplicate`

转账：

- `POST /api/transfers`
- `PUT /api/transfers/:id`
- `DELETE /api/transfers/:id`

账户：

- `GET /api/accounts`
- `POST /api/accounts`
- `PUT /api/accounts/:id`
- `DELETE /api/accounts/:id`
- `POST /api/accounts/:id/recalculate`
- `PUT /api/accounts/include-in-assets`

分类：

- `GET /api/categories`
- `POST /api/categories`
- `PUT /api/categories/:id`
- `DELETE /api/categories/:id`
- `PUT /api/categories/reorder`

报表：

- `GET /api/reports/summary`
- `GET /api/reports/category`
- `GET /api/reports/trend`
- `GET /api/reports/compare`
- `GET /api/reports/member`

借贷：

- `GET /api/loans/groups`
- `POST /api/loans/groups`
- `PUT /api/loans/groups/:groupId`
- `GET /api/loans`
- `GET /api/loans/:id`
- `POST /api/loans`
- `PUT /api/loans/:id`
- `DELETE /api/loans/:id`
- `POST /api/loans/:id/entries`
- `DELETE /api/loans/:id/entries/:entryId`
- `POST /api/loans/:id/close`
- `POST /api/loans/:id/reopen`

预算：

- `GET /api/budgets/current`
- `GET /api/budgets/:month`
- `PUT /api/budgets/:month`
- `PUT /api/budgets/:month/categories`

导入：

- `POST /api/imports/pocket/preview`
- `POST /api/imports/pocket/commit`
- `GET /api/imports`
- `GET /api/imports/:id`
- `GET /api/imports/:id/warnings`

备份：

- `POST /api/backups/create`
- `GET /api/backups`
- `POST /api/backups/restore`
- `GET /api/export/full`

## 8. 前端设计

推荐技术：

- React + TypeScript。
- Vite。
- React Router。
- TanStack Query。
- Zustand 或 Jotai。
- Recharts 或 ECharts。
- lucide-react 图标。
- PWA 支持。

UI 风格：

- 移动端优先。
- iOS 风格列表、弹层、分段控件。
- 白底、浅灰分隔线、蓝色主色。
- 分类和账户使用彩色圆形图标。
- 不使用口袋记账原品牌素材。
- 交互上像原 App，但视觉细节属于自有设计。

### 8.1 前端目录建议

```text
apps/web/
  src/
    app/
      App.tsx
      router.tsx
      queryClient.ts
    pages/
      LedgerHome.tsx
      EntryEditor.tsx
      AssetsPage.tsx
      ReportsPage.tsx
      LoansPage.tsx
      MorePage.tsx
      SearchPage.tsx
    components/
      BottomTabs.tsx
      AmountKeyboard.tsx
      CategoryGrid.tsx
      AccountPicker.tsx
      DatePickerSheet.tsx
      MemberPickerSheet.tsx
      TransactionTimeline.tsx
      SwipeActionRow.tsx
      SegmentedControl.tsx
    features/
      transactions/
      accounts/
      reports/
      loans/
      budgets/
      imports/
      categories/
    lib/
      api.ts
      formatMoney.ts
      date.ts
      constants.ts
```

### 8.2 关键组件逻辑

AmountKeyboard：

- 管理金额字符串。
- 支持小数点。
- 支持清空。
- 支持加减号表达式。
- 输出 decimal 字符串给表单。

CategoryGrid：

- 按收入/支出加载分类。
- 支持点击选择。
- 编辑模式显示删除按钮。
- 支持新增分类。

TransactionTimeline：

- 按日期分组。
- 每天展示收入/支出小结。
- 支持账单左滑操作。

AccountPicker：

- 底部弹层。
- 显示账户名、余额、图标、类型。
- 支持资产/负债筛选。

DatePickerSheet：

- 记账时使用底部日历。
- 借贷到期日可使用滚轮式日期选择。

Reports：

- 分类页：环形图 + 列表。
- 趋势页：折线图 + 月度表。
- 对比页：分类条形对比。

## 9. 导入设计

### 9.1 导入流程

1. 上传 `.xls` 文件。
2. 后端解析工作表。
3. 生成预览：
   - 行数。
   - 时间范围。
   - 账户数量。
   - 分类数量。
   - 账本数量。
   - 成员数量。
   - 转账配对结果。
   - 借贷关联结果。
   - 警告列表。
4. 用户确认导入。
5. 写入数据库。
6. 重算账户余额。
7. 重算统计缓存。
8. 生成导入报告。

### 9.2 去重规则

每行生成 `source_row_hash`：

- 工作表名。
- 行号。
- 时间。
- 类型。
- 分类。
- 金额。
- 账户。
- 账本。
- 成员。
- 备注。

同一导入批次内重复行跳过。

再次导入时提供两种模式：

- 清空重导：适合最终迁移。
- 增量导入：只导入未出现过的行。

第一版建议实现两种，但默认推荐清空重导。

### 9.3 转账配对规则

候选条件：

- 分类为 `转账`。
- 日期相同。
- 金额绝对值相同。
- 一正一负。
- 账户不同。

配对后：

- 创建 `transfers` 记录。
- 两条原流水写入 `transactions`。
- 两条流水共享 `transfer_id`。

如果同一天同金额有多组转账：

- 按原始行顺序配对。
- 如果无法唯一判断，记录导入警告。

### 9.4 余额变更规则

分类为 `余额变更` 的记录：

- 写入 `transactions`。
- `type = balance_adjustment`。
- 影响账户余额。
- 默认不计入收支报表。

### 9.5 借贷导入规则

`借入借出` 表：

- 生成 `loans` 或 `loan_entries`。

`收支记录` 中以下分类：

- `借出`
- `借入`
- `收款`
- `还款`

生成账户流水，并尝试与借贷主记录关联。

关联依据：

- 日期。
- 金额。
- 对方名称/成员/备注。
- 使用账户。

无法关联时：

- 保留流水。
- 记录导入警告。
- 后续可在界面手动关联。

## 10. 统计口径

### 10.1 首页月收入/月支出

收入：

- `type = income`
- 排除转账转入。
- 排除余额变更。
- 默认排除借入/收款，借贷单独统计。

支出：

- `type = expense`
- 排除转账转出。
- 排除余额变更。
- 默认排除借出/还款，借贷单独统计。

结余：

- 收入 - 支出。

### 10.2 账户余额

账户余额必须以流水为准：

```text
账户余额 = 初始余额 + SUM(transactions.amount where account_id = 当前账户 and deleted_at is null)
```

### 10.3 净资产

```text
资产总额 = SUM(asset accounts included current_balance)
负债总额 = SUM(liability accounts included ABS(current_balance))
净资产 = 资产总额 - 负债总额
```

### 10.4 预算

```text
预算已用 = 本月普通支出合计
预算剩余 = 月预算 - 预算已用
分类预算已用 = 本月该分类普通支出合计
```

## 11. 群晖部署方案

### 11.1 推荐目录

群晖目录：

```text
/volume1/docker/pocket-ledger/
  data/
    app.db
    backups/
    uploads/
  config/
    .env
  docker-compose.yml
```

### 11.2 Docker Compose 草案

```yaml
services:
  pocket-ledger:
    image: pocket-ledger:latest
    container_name: pocket-ledger
    restart: unless-stopped
    ports:
      - "3456:3000"
    env_file:
      - ./config/.env
    volumes:
      - ./data:/data
```

### 11.3 环境变量

```text
APP_ENV=production
APP_PORT=3000
APP_URL=http://nas-ip:3456
DATABASE_URL=file:/data/app.db
SESSION_SECRET=replace-with-long-random-string
ADMIN_USERNAME=admin
ADMIN_INITIAL_PASSWORD=change-me-on-first-login
BACKUP_DIR=/data/backups
UPLOAD_DIR=/data/uploads
```

### 11.4 访问方式

局域网：

```text
http://群晖IP:3456
```

外网访问：

- 建议优先使用 Tailscale / ZeroTier / 群晖 VPN。
- 不建议直接把服务暴露到公网。
- 如果必须公网访问，需要反向代理 + HTTPS + 强密码。

## 12. 备份与迁移

### 12.1 自动备份

策略：

- 每天凌晨生成 SQLite 备份。
- 保留最近 30 天。
- 每月保留 1 份长期备份。

备份内容：

- `app.db`
- 上传附件目录，第一版可为空。
- 导入原始文件可选保存。

### 12.2 手动导出

支持：

- 导出完整 SQLite。
- 导出 Excel/CSV。
- 导出 JSON。

### 12.3 恢复

恢复流程：

1. 上传备份文件。
2. 后端校验版本。
3. 当前数据库先自动备份一份。
4. 替换数据库。
5. 重启服务或重新加载连接。

### 12.4 最终迁移建议

开发完成后，你提供最新口袋记账导出文件。

推荐迁移方式：

1. 在测试库导入最新文件。
2. 检查导入报告。
3. 对比账户余额、月收入、月支出、借贷余额。
4. 无误后清空正式库重导。
5. 生成正式库备份。

## 13. 安全策略

第一版：

- 单用户登录。
- 密码哈希存储。
- Cookie session。
- CSRF 保护。
- 上传文件大小限制。
- 只允许上传 `.xls`、`.xlsx`、`.csv`。
- 导入文件不执行宏。

部署建议：

- NAS 内网访问优先。
- 不直接公网暴露。
- 定期备份。
- 初次登录强制改密码。

## 14. 开发顺序

### 阶段 1：项目骨架

- 初始化前后端项目。
- Docker 开发环境。
- SQLite 迁移。
- 登录。
- 基础布局和底部导航。

### 阶段 2：核心记账

- 账户。
- 分类。
- 账单 CRUD。
- 金额键盘。
- 收入/支出记账。
- 转账。

### 阶段 3：数据导入

- `.xls` 解析。
- 导入预览。
- 转账配对。
- 借贷导入。
- 导入提交。
- 导入报告。

### 阶段 4：统计和资产

- 首页月统计。
- 分类报表。
- 趋势报表。
- 对比报表。
- 资产/负债。
- 计入资产账户选择。

### 阶段 5：借贷和预算

- 借贷列表。
- 新建借出/借入。
- 收款/还款。
- 借贷详情。
- 预算设置。
- 分类预算。

### 阶段 6：NAS 部署和验收

- Dockerfile。
- docker-compose。
- 群晖部署文档。
- 自动备份。
- 最新数据迁移演练。

## 15. 验收标准

### 15.1 导入验收

- 能成功读取口袋记账导出 `.xls`。
- 主流水行数与导入报告一致。
- 账户、分类、账本、成员能自动创建。
- 转账能自动配对。
- 无法配对的转账进入警告列表。
- 借贷记录不重复计算。

### 15.2 账单验收

- 能新增收入。
- 能新增支出。
- 能新增转账。
- 能编辑账单。
- 能删除账单。
- 账单首页按日期正确分组。
- 月收入、月支出与明细一致。

### 15.3 资产验收

- 账户余额与流水合计一致。
- 转账只影响账户，不影响收支统计。
- 余额变更影响账户，不进入消费统计。
- 可以选择账户是否计入资产。

### 15.4 报表验收

- 分类统计金额正确。
- 趋势按月份聚合正确。
- 对比页分类金额正确。
- 搜索筛选后的合计正确。

### 15.5 借贷验收

- 借出生成应收。
- 收款减少应收。
- 借入生成应付。
- 还款减少应付。
- 利息可单独记录。
- 已结清可标记结束。

### 15.6 部署验收

- 群晖 Container Manager 可启动。
- 数据写入挂载目录。
- 重启容器数据不丢失。
- 备份文件可生成。
- 备份可恢复。

## 16. 当前决策结论

已定：

- 做高仿口袋记账 iOS 风格，但视觉自有化。
- 做 Web/PWA，不做原生 iOS。
- 部署在群晖 Container Manager。
- 数据库使用 SQLite。
- 单人使用。
- 第一版做完整导入、记账、账户、统计、借贷、预算。
- 项目/报销独立模块暂缓。
- 搜索筛选作为本项目增强功能加入。

待开发时再确认：

- App 名称。
- 主色和图标风格。
- 是否需要登录页背景/品牌语。
- 最终迁移时采用清空重导还是增量导入。
