# BTC 灵动岛：Scripting 多源自动刷新版

## 更新到 1.3.0：自动刷新与多活动价格显示

行情来源、官方网关、备用顺序和完整报价的两位小数格式均不变；本版没有增加中转服务器，也不解决接口的网络可达性问题。

1. 更新完整远程项目，确认菜单版本为 **v1.3.0**。必须包含 `index.tsx`、`auto_refresh.ts`、`quotes.ts`、`live_activity.tsx` 和 `script.json`；不能只更新入口文件。
2. 点“开始显示 / 开启自动刷新”，成功后立即显示首份报价，每轮结束后间隔 **30 秒**自动尝试下一轮。不并发叠加行情请求；请求、备用通道和系统调度可能延长两次成功更新的间隔。
3. 后续失败只记日志并自动重试，不反复弹窗；保留旧价格和旧行情时间，两分钟未更新后标记 stale。展开灵动岛或查看锁屏，以行情时间判断是否仍在更新。
4. 重新运行同一个脚本可打开控制菜单，不会另开刷新循环；取消菜单继续运行。修改行情源影响后续轮次，已发出的请求可能仍返回修改前来源的真实报价。
5. 点“停止自动刷新 / 隐藏价格”，取消等待中的定时器，等待正在进行的一轮结束，再仅结束本脚本保存的活动并释放保活请求；停止动作不发起新的行情请求。手动移除活动后，后续轮次检测到活动已结束会停止，不会偷偷重新创建。

### 其他 App 同时使用灵动岛

- iOS 在多个实时活动共用灵动岛时使用 `minimal` 最小布局，不会继续显示本脚本的 `compactTrailing` 完整价格。旧代码的 `minimal` 只有 ₿，因此共用时价格看似消失，这不是仅凭截图就能判定的断网或停更。
- 本版把 `minimal` 改成单行纯数字，保留价格的完整整数位：`85573.58` 显示为 **85573**，`105573.58` 显示为 **105573**。不显示 ₿、单位、逗号、`k` / `m` 或小数；不截去前后整数位，不补零凑五位，也不将小数四舍五入进整数。只有最小布局省略小数，不修改原始报价。
- 单独占用时仍显示 `85573.58`；长按 BTC 所在区域展开，或在锁屏查看，可读到完整报价、来源及行情时间。
- 最小区域的大小、位置及可见活动由系统决定，脚本不能强制独占整个灵动岛，也不能保证任意数量活动同时可见。小字体、单行与缩放只是适配措施，实际可读性仍需手机复测。
- 更新脚本后，先停止本脚本的旧活动，再重新开启，以验证新的布局；仅更新源文件不等于已在手机上重新注册活动。

### 后台运行边界

- 首次成功显示后，脚本保持运行，不立即调用 `Script.exit()`；支持时通过 `Script.minimize()` 收起界面，并通过 `Script.onResume()`恢复控制菜单。旧版应用缺少恢复接口时明确提示更新 Scripting。
- 使用官方 `BackgroundKeeper.keepAlive()` 请求延长后台运行；该功能可能需要 **Scripting Pro**。请求被拒绝、接口缺失或报错时，明确提示只开启前台自动刷新，不冒充后台成功。
- **即使保活请求成功，也不能保证锁屏、切后台后永久运行。** 官方文档明确说明这是有限时长的尽力保活，iOS 仍可能暂停或终止应用；强制关闭 Scripting 后本脚本不能刷新。实时活动继续显示不代表脚本还在运行。
- 持续轮询和保活会增加电量及流量消耗。无需服务器的本地实现不等同于 APNs 服务端推送；本版未部署推送服务，也没有注册额外自动化任务。
- 如果发现时间不再变化，重新打开 Scripting 运行脚本；如果旧实例仍活着，先停止再重新开启。如果已被系统结束，直接重新开启会恢复本脚本的已有活动。

四个源文件通过语法及严格类型检查（文档对应的 API 声明桩），20 个自动刷新模拟场景覆盖串行轮询、失败重试、旧时间保留、保活拒绝 / 异常 / 缺失、恢复菜单、来源切换、停止竞态、资源清理、异步恢复旧活动和活动移除后不重建。模拟验证不代替 iPhone 真机的后台时长、Pro 权限及实时活动更新频率测试。

## 更新到 1.2.0：修正 OKX / BG 的连接路径

1.2.0 的官方网关修正仍保留；更新后启动菜单应显示 **BTC 灵动岛 v1.3.0**。

本版不是简单建议“换成币安”，而是增加 OKX 和 Bitget 本身的官方取价通道：

- **OKX**：优先 `openapi.okx.com` 的专用 REST API，而不是只有网站域名；其次尝试 `ws.okx.com` 的官方公共 WebSocket，最后尝试旧的 `www.okx.com` API。
- **Bitget / BG**：优先 `ws.bitget.com` 官方现货 WebSocket，从不同网关取价；其次保留 `api.bitget.com` REST。不是对原来 TLS 失败的域名反复重试。
- **币安**：保留 `data-api.binance.vision` 和 `api.binance.com` 两个 REST 接口。
- 固定交易所时仅在该交易所的通道间备用，绝不会用币安价格冒充 OKX 或 BG。启动成功弹窗显示实际交易所、域名、REST / WebSocket。
- 每条通道设置 6 秒时限。网络测试按所选来源并行检测：选 BG 测两条，选币安测两条，选 OKX 测三条，选自动测全部七条。

## 手机复测

1. 更新完整远程脚本，确认菜单版本为 **v1.3.0**。
2. 在不启用 VPN 的实际蜂窝网络上运行。
3. 在“行情源设置”选 **OKX**，再点“测试当前网络”；重点看 `openapi.okx.com` 和 `ws.okx.com` 的结果。
4. 在“行情源设置”选 **Bitget**，再点“测试当前网络”；重点看 `ws.bitget.com` 的结果。
5. 有任一通道测试成功，即可点“开始显示 / 开启自动刷新”。同一交易所的某条通道失败不会阻止其备用通道取价。
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
- 每轮 WebSocket 仍只用于单次取价：收到首份有效现货报价即关闭连接；不保留持续订阅。
- 自动轮询与尽力后台保活见 1.3.0 说明；没有推送服务。活动继续显示不代表价格持续更新。
- 订阅确认、心跳、错误消息不会当作价格；错误交易对、非现货、无效数值、超过五分钟的报价和明显未来的时间都不接受。
- 网络失败保留旧报价，但不把旧行情时间改成当前时间；更新两分钟后标记 stale。
- 如需允许实时活动，在系统设置的 Scripting 页面检查权限。返回主屏幕查看；其他活动共用灵动岛时，最小模式显示完整整数位的纯数字，不再只显示 ₿，也不使用 `k` / `m` 缩写。含两位小数的完整报价请长按展开或在锁屏查看。
- 停止操作不发起新请求，仅等待正在进行的一轮收尾，再结束本脚本记录的活动。继续保留 1.1.1 的异步恢复等待与方法检查，避免把未等待的恢复结果当作活动实例。
- 行情失败显示“行情暂不可用”，代码 / 活动处理失败显示“脚本运行失败”。

## 验证边界与官方资料

开发环境已通过 OKX 专用 REST API、OKX 公共 WebSocket 和 Bitget 公共 WebSocket 取得真实 BTC/USDT 报价。三个源文件通过语法和声明桩类型检查；25 个通道模拟场景覆盖 TLS 失败、同源备用、订阅拒绝、超时、旧行情、错误交易对、非现货及连接 / 定时器清理，6 个集成场景覆盖新通道启动、异步更新、来源切换、测试不改活动、失败保留旧报价及离线停止。这不是 iPhone 蜂窝网络测试，不能代替 Scripting 真机、实时活动布局和国内网络验证。

此前 1.1.0 的活动恢复模拟采用同步返回，遗漏异步恢复问题；1.1.1 已修复并增加异步返回模型的回归验证。1.2.0 在此基础上增加不同官方网关的取价路径，不宣称运营商限制已被解除。

- Scripting WebSocket：`https://scriptingapp.github.io/guide/Utilities/WebScoket.md`（官方文档路径如此拼写，接口名仍为 `WebSocket`）
- Scripting LiveActivity：`https://scriptingapp.github.io/guide/LiveActivity.md`
- Scripting 后台保活：`https://scriptingapp.github.io/guide/Device%20Capabilities/BackgroundKeeper.md`
- Scripting 收起与恢复：`https://scriptingapp.github.io/guide/Script/Script%20Minimization%20and%20Resume.md`
- Apple 实时活动布局：`https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities`
- Apple 最小布局与尺寸指导：`https://developer.apple.com/design/human-interface-guidelines/live-activities`
- OKX API 域名说明：`https://www.okx.com/zh-hans/help/whats-new-api-domain-updates-for-global-users`
- OKX 接口：`https://www.okx.com/docs-v5/en/`
- BG WebSocket 升级说明：`https://www.bitget.com/api-doc/common/websocket-upgrade-guide`

BG 实际采用经典 **v2 现货**通道，不是 UTA v3 接口；版本路径、订阅参数及返回字段在开发环境已通过实连接核对。
