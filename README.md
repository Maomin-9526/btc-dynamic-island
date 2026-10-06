# BTC 灵动岛：Scripting 多源手动刷新版

## 更新到 1.1.1

已安装旧版时，请在 Scripting 中更新远程脚本或重新导入本仓库的完整项目。启动菜单标题应为“BTC 灵动岛 v1.1.1”；仅再次点击旧脚本不会下载新代码。

- 恢复已有活动时，先 `await LiveActivity.from(...)`，再调用活动的 `update` 或 `end`，兼容异步返回结果；避免 `activity.update is not a function` 和同类停止错误。
- 恢复结果会检查是否有 `update/end` 方法。若实际应用接口不兼容，显示明确提示，不结束其他脚本的活动。
- 行情请求失败显示“行情暂不可用”；代码、权限或活动处理失败显示“脚本运行失败”，不再把所有失败都附加成网络错误。
- 这次修复不改变接口地址，也不会绕过 TLS/证书校验。OKX 超时和 Bitget TLS 连接失败仍需通过本机网络测试判断；不要误认为代码修复一定能解除网络限制。

## 多源与小数功能

- 灵动岛紧凑模式现在固定保留两位小数，例如 `85266.38`，不加千位分隔符以节省宽度。展开和锁屏显示 `85,266.38 USDT`。
- 增加“行情源设置”：自动选择、Bitget、币安 Binance、OKX；选择会保存在本脚本的本地存储中，下次运行继续使用。
- 默认自动模式依次尝试 Bitget → 币安行情专用域名 → 币安主域名 → OKX，每个请求设置 6 秒超时。有一个来源取得有效报价即停止尝试。
- 固定来源模式不会切换到其他交易所；币安模式只在币安的两个官方域名之间备用。成功弹窗、展开卡片和锁屏卡片注明实际行情来源，成功弹窗还显示实际接口域名。
- 增加“测试当前网络（不更新价格）”，并行测试四个官方接口，显示本机此刻的成功、耗时或错误。不修改行情源设置，不修改已有活动。
- 新增 `quotes.ts` 文件，更新时必须一并下载，不能只替换 `index.tsx`。

## iPhone 上使用

1. 在 Scripting 导入本仓库的完整脚本项目，或创建名为 `BTC灵动岛` 的项目。
2. 手动创建时，同一个项目需要 `index.tsx`、`live_activity.tsx`、`quotes.ts` 三个源文件；不要合并文件。应用创建的 `script.json` 无须手动替换。
3. 运行脚本，确认启动菜单版本为 **v1.1.1**。
4. 不想使用 VPN 时，先关闭 VPN，并在实际使用的蜂窝网络或 Wi-Fi 上点击“测试当前网络”。
5. 点击“行情源设置”选自动模式，或固定到测试成功的交易所；选择后返回主菜单，再点“开始显示 / 刷新价格”。更改设置本身不会立即更新旧活动。
6. 允许系统请求的实时活动权限，返回主屏幕查看价格；长按灵动岛查看两位小数、实际来源、24 小时涨跌幅和行情时间。
7. 再次运行脚本可以手动刷新，或选择“停止显示”。若旧活动仍显示旧版的固定 OKX 标题，先停止显示，再启动以重建界面。

## 接口与国内网络

以下均为交易所官方的公共 **BTC/USDT 现货行情**。无须登录、钱包、API 密钥或交易权限，不读取交易所 App 的账户。

| 来源 | 接口 |
| --- | --- |
| Bitget | `https://api.bitget.com/api/v2/spot/market/tickers?symbol=BTCUSDT` |
| 币安行情专用域名 | `https://data-api.binance.vision/api/v3/ticker/24hr?symbol=BTCUSDT` |
| 币安主域名 | `https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT` |
| OKX | `https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT` |

**增加来源不等于保证国内免 VPN。** 是否直连取决于地区、运营商、DNS 和交易所当时的访问策略。开发环境请求成功不能证明你的手机流量可达，也不代表 Bitget 是国内服务器；请以手机上的网络测试结果为准。

若全部失败，先检查 iPhone 的 Scripting 蜂窝数据权限，再切换 Wi-Fi 测试。不要把过期价格当作新报价，不使用不明“镜像接口”，不需要提供密码或账户密钥。本项目没有内置代理、收费服务或自建行情中转。

## 价格与刷新限制

- 紧凑灵动岛、展开和锁屏都保留两位小数。价格单位为 USDT，不是美元现金；不同交易所的现货价格可能不同。
- 每次刷新采用同一个成功接口的价格、涨跌幅和行情时间，不把不同交易所的数据拼接在一起。
- Bitget 的 `change24h` 是比例（`0.01` 表示 `1%`）；币安的 `priceChangePercent` 是百分数；OKX 用 `last/open24h` 计算。
- 本版本仍然没有自动轮询、后台保活或推送服务。切出应用后，价格不会自动刷新；脚本结束后实时活动可以保留。
- 状态携带行情时间，更新两分钟后标记为 stale；界面明确标注“手动刷新”。
- 网络或数据验证失败不覆盖上一份活动报价。超过五分钟的行情、明显未来的时间、非 BTC/USDT 行情和无效数值都会拒绝更新。
- 停止只针对本脚本保存的活动 ID，不结束其他脚本创建的活动。iOS 调度灵动岛展示；有其他实时活动时，最小模式可能只显示 ₿ 图标，无法强制在最小模式放下完整价格。

## 官方参考与验证边界

- Scripting：`https://scriptingapp.github.io/guide/LiveActivity.md`
- Scripting fetch：`https://scriptingapp.github.io/guide/Utilities/Request/fetch.md`
- Bitget 现货行情：`https://www.bitget.com/zh-CN/docs/catalog/classic-spot-market/classic-spot-market`
- 币安公共行情域名：`https://developers.binance.com/en/docs/products/spot/faqs/market_data_only`
- OKX：`https://www.okx.com/docs-v5/en/`

1.1.0 的开发环境请求四个公共接口均取得有效 BTC/USDT 报价，模拟验证覆盖各交易所字段、小数格式、数据时效、接口备用、来源持久化、网络测试不改价格、失败保留旧报价和离线停止。但此前的活动恢复模拟使用同步返回值，未覆盖异步恢复错误。

1.1.1 新增异步恢复模型回归验证：旧代码在该模型下复现 `activity.update/end is not a function`，修复后核对再次刷新、停止、陈旧活动、旧版存储状态及错误分类。TypeScript 检查使用 API 声明桩，不是手机同步的真实 SDK 类型。没有连接你的 iPhone，以上验证不保证实际网络可达、系统布局或应用版本兼容性，仍需真机复测。
