# BTC 灵动岛：Scripting 多源手动刷新版

## 更新到 1.2.0：修正 OKX / BG 的连接路径

更新 Scripting 的完整远程项目，启动菜单应显示 **BTC 灵动岛 v1.2.0**。三个源文件 `index.tsx`、`quotes.ts`、`live_activity.tsx` 都要保留，不能只替换入口文件。

本版不是简单建议“换成币安”，而是增加 OKX 和 Bitget 本身的官方取价通道：

- **OKX**：优先 `openapi.okx.com` 的专用 REST API，而不是只有网站域名；其次尝试 `ws.okx.com` 的官方公共 WebSocket，最后尝试旧的 `www.okx.com` API。
- **Bitget / BG**：优先 `ws.bitget.com` 官方现货 WebSocket，从不同网关取价；其次保留 `api.bitget.com` REST。不是对原来 TLS 失败的域名反复重试。
- **币安**：保留 `data-api.binance.vision` 和 `api.binance.com` 两个 REST 接口。
- 固定交易所时仅在该交易所的通道间备用，绝不会用币安价格冒充 OKX 或 BG。成功弹窗显示实际交易所、域名、REST / WebSocket。
- 每条通道设置 6 秒时限。网络测试按所选来源并行检测：选 BG 测两条，选币安测两条，选 OKX 测三条，选自动测全部七条。

## 手机复测

1. 更新完整远程脚本，确认菜单版本为 **v1.2.0**。
2. 在不启用 VPN 的实际蜂窝网络上运行。
3. 在“行情源设置”选 **OKX**，再点“测试当前网络”；重点看 `openapi.okx.com` 和 `ws.okx.com` 的结果。
4. 在“行情源设置”选 **Bitget**，再点“测试当前网络”；重点看 `ws.bitget.com` 的结果。
5. 有任一通道测试成功，即可点“开始显示 / 刷新价格”。同一交易所的某条通道失败不会阻止其备用通道取价。
6. 若仍失败，发该交易所的完整测试结果。不要发送账户、钱包、密码或 API 密钥。

**这次修复的是连接路径和备用能力，不等于已验证你的手机网络恢复。** 开发环境能连通新的官方网关，不代表国内各运营商都能访问。所有通道都被限制时，客户端无法凭修改价格解析或延长超时解除限制；进一步需要可从手机直连的可信行情中转及其服务器 / 域名，不能把未部署的中转说成已经可用。

本项目不禁用 TLS / 证书验证，不降级 HTTP，不使用不明镜像或公共代理，也没有内置收费中转。

## 官方连接清单

| 来源 | 优先级 | 协议与地址 |
| --- | --- | --- |
| BG | 1 | `wss://ws.bitget.com/v2/ws/public`，订阅 `SPOT / ticker / BTCUSDT` |
| BG | 2 | `https://api.bitget.com/api/v2/spot/market/tickers?symbol=BTCUSDT` |
| 币安 | 1 | `https://data-api.binance.vision/api/v3/ticker/24hr?symbol=BTCUSDT` |
| 币安 | 2 | `https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT` |
| OKX | 1 | `https://openapi.okx.com/api/v5/market/ticker?instId=BTC-USDT` |
| OKX | 2 | `wss://ws.okx.com/ws/v5/public`，订阅 `tickers / BTC-USDT` |
| OKX | 3 | `https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT` |

自动模式按 BG → 币安 → OKX 顺序逐个尝试这些通道，取得一份有效报价就停止。固定模式不跨交易所。来源选择保存在脚本本地存储中。

## 刷新、价格与权限

- 只读取公开 BTC/USDT 现货行情，不登录交易所账户，无须 API 密钥或交易权限。
- 灵动岛紧凑模式保留两位小数，例如 `85266.38`；展开和锁屏显示完整价格、来源、涨跌幅和行情时间。单位为 USDT，不是美元现金。
- WebSocket 只用于单次取价：收到首份有效现货报价即关闭连接，不在后台长期运行。
- **仍需手动刷新**，没有自动轮询、后台保活或推送服务。活动继续显示不代表价格持续更新。
- 订阅确认、心跳、错误消息不会当作价格；错误交易对、非现货、无效数值、超过五分钟的报价和明显未来的时间都不接受。
- 网络失败保留旧报价，但不把旧行情时间改成当前时间；更新两分钟后标记 stale。
- 如需允许实时活动，在系统设置的 Scripting 页面检查权限。返回主屏幕查看；其他活动争用灵动岛时，最小模式可能仅显示 ₿。
- “停止显示”无需联网，仅结束本脚本记录的活动。继续保留 1.1.1 的异步恢复等待与方法检查，避免把未等待的恢复结果当作活动实例。
- 行情失败显示“行情暂不可用”，代码 / 活动处理失败显示“脚本运行失败”。

## 验证边界与官方资料

开发环境已通过 OKX 专用 REST API、OKX 公共 WebSocket 和 Bitget 公共 WebSocket 取得真实 BTC/USDT 报价。三个源文件通过语法和声明桩类型检查；25 个通道模拟场景覆盖 TLS 失败、同源备用、订阅拒绝、超时、旧行情、错误交易对、非现货及连接 / 定时器清理，6 个集成场景覆盖新通道启动、异步更新、来源切换、测试不改活动、失败保留旧报价及离线停止。这不是 iPhone 蜂窝网络测试，不能代替 Scripting 真机、实时活动布局和国内网络验证。

此前 1.1.0 的活动恢复模拟采用同步返回，遗漏异步恢复问题；1.1.1 已修复并增加异步返回模型的回归验证。1.2.0 在此基础上增加不同官方网关的取价路径，不宣称运营商限制已被解除。

- Scripting WebSocket：`https://scriptingapp.github.io/guide/Utilities/WebScoket.md`（官方文档路径如此拼写，接口名仍为 `WebSocket`）
- Scripting LiveActivity：`https://scriptingapp.github.io/guide/LiveActivity.md`
- OKX API 域名说明：`https://www.okx.com/zh-hans/help/whats-new-api-domain-updates-for-global-users`
- OKX 接口：`https://www.okx.com/docs-v5/en/`
- BG WebSocket 升级说明：`https://www.bitget.com/api-doc/common/websocket-upgrade-guide`

BG 实际采用经典 **v2 现货**通道，不是 UTA v3 接口；版本路径、订阅参数及返回字段在开发环境已通过实连接核对。
