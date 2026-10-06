export class BackgroundLocationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BackgroundLocationError"
  }
}

export type BackgroundLocationSession = {
  readonly lastUpdateTime: number | null
  stop(): Promise<void>
}

export async function startBackgroundLocation(): Promise<BackgroundLocationSession> {
  if (typeof Location === "undefined" ||
      typeof Location.startUpdatingLocation !== "function" ||
      typeof Location.stopUpdatingLocation !== "function" ||
      typeof Location.addLocationListener !== "function" ||
      typeof Location.removeLocationListener !== "function" ||
      typeof Location.setAccuracy !== "function" ||
      typeof Location.setDistanceFilter !== "function" ||
      typeof Location.setAllowsBackgroundLocationUpdates !== "function" ||
      typeof Location.setPausesLocationUpdatesAutomatically !== "function" ||
      typeof Location.setShowsBackgroundLocationIndicator !== "function") {
    throw new BackgroundLocationError("当前 Scripting 缺少连续后台定位接口，请更新应用。也可重新运行并选择“仅前台刷新”；不会调用 Pro 后台保活或付费推送服务。")
  }

  const previous = {
    accuracy: Location.accuracy,
    distanceFilter: Location.distanceFilter,
    allowsBackgroundLocationUpdates: Location.allowsBackgroundLocationUpdates,
    pausesLocationUpdatesAutomatically: Location.pausesLocationUpdatesAutomatically,
    showsBackgroundLocationIndicator: Location.showsBackgroundLocationIndicator,
  }
  let listenerRegistered = false
  let updatesRequested = false
  let stopped = false
  let stopPromise: Promise<void> | null = null
  let lastUpdateTime: number | null = null
  const onLocationUpdate = () => {
    if (!stopped) lastUpdateTime = Date.now()
  }

  function stop(): Promise<void> {
    if (stopPromise) return stopPromise
    stopped = true
    stopPromise = (async () => {
      const cleanup = [
        { name: "定位回调", run: () => {
          if (listenerRegistered) Location.removeLocationListener(onLocationUpdate)
        } },
        { name: "连续定位", run: () => {
          if (updatesRequested) Location.stopUpdatingLocation()
        } },
        { name: "后台定位设置", run: () => Location.setAllowsBackgroundLocationUpdates(previous.allowsBackgroundLocationUpdates) },
        { name: "自动暂停设置", run: () => Location.setPausesLocationUpdatesAutomatically(previous.pausesLocationUpdatesAutomatically) },
        { name: "定位指示设置", run: () => Location.setShowsBackgroundLocationIndicator(previous.showsBackgroundLocationIndicator) },
        { name: "距离筛选设置", run: () => Location.setDistanceFilter(previous.distanceFilter) },
        { name: "精度设置", run: () => Location.setAccuracy(previous.accuracy) },
      ]
      const failures: string[] = []
      for (const action of cleanup) {
        try {
          await action.run()
        } catch {
          failures.push(action.name)
        }
      }
      if (failures.length) {
        throw new BackgroundLocationError(`定位清理未全部成功：${failures.join("、")}。请关闭 Scripting 或在系统设置中关闭其定位权限，再重新运行。`)
      }
    })()
    return stopPromise
  }

  try {
    listenerRegistered = true
    Location.addLocationListener(onLocationUpdate)
    updatesRequested = true
    const authorization = await Location.startUpdatingLocation({ requestAlwaysAuthorization: true })
    if (authorization?.mode !== "always") {
      throw new BackgroundLocationError("系统没有确认“始终允许定位”，实验后台模式未开启。请到设置 → 隐私与安全性 → 定位服务 → Scripting，选择“始终”，然后重新运行。iOS 可能不再弹出升级授权提示；也可选择“仅前台刷新”。")
    }
    await Location.setAccuracy("hundredMeters")
    Location.setDistanceFilter(-1)
    Location.setPausesLocationUpdatesAutomatically(false)
    Location.setShowsBackgroundLocationIndicator(true)
    Location.setAllowsBackgroundLocationUpdates(true)
    return {
      get lastUpdateTime() { return lastUpdateTime },
      stop,
    }
  } catch (error) {
    await stop()
    if (error instanceof BackgroundLocationError) throw error
    throw new BackgroundLocationError("实验后台定位启动失败，已执行定位清理。请检查系统定位权限及 Scripting 版本，也可重新运行并选择“仅前台刷新”。")
  }
}
