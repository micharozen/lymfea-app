import { useState, useEffect, useCallback } from "react";

// Global tap counter for secret debug activation
let tapCount = 0;
let tapTimer: NodeJS.Timeout | null = null;

/**
 * Debug overlay to display viewport and safe-area values in real-time.
 * Activate by: ?debug=true in URL, or tap 5 times quickly anywhere on screen
 */
const DebugViewportOverlay = () => {
  const [values, setValues] = useState({
    innerHeight: 0,
    innerWidth: 0,
    visualViewportHeight: 0,
    visualViewportWidth: 0,
    safeAreaTop: "0px",
    safeAreaBottom: "0px",
    safeAreaLeft: "0px",
    safeAreaRight: "0px",
    oomSafeBottom: "0px",
    dvh: "N/A",
    vh: "N/A",
    // Layout elements
    tabBarHeight: 0,
    tabBarBottom: 0,
    mainHeight: 0,
    mainScrollHeight: 0,
    layoutHeight: 0,
  });
  const [isVisible, setIsVisible] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(() => {
    // Check localStorage or URL param
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      return localStorage.getItem("oom-debug") === "true" || urlParams.get("debug") === "true";
    }
    return false;
  });

  // Secret tap gesture to enable debug mode
  useEffect(() => {
    const handleTap = () => {
      tapCount++;
      if (tapTimer) clearTimeout(tapTimer);
      
      if (tapCount >= 5) {
        tapCount = 0;
        const newState = !debugEnabled;
        setDebugEnabled(newState);
        localStorage.setItem("oom-debug", newState.toString());
        if (newState) {
          alert("🛠️ Debug mode activé!");
        } else {
          alert("Debug mode désactivé");
        }
      }
      
      tapTimer = setTimeout(() => {
        tapCount = 0;
      }, 1000);
    };

    document.addEventListener("click", handleTap);
    return () => document.removeEventListener("click", handleTap);
  }, [debugEnabled]);

  useEffect(() => {
    if (!debugEnabled) return;

    const update = () => {
      // Create temp element to measure safe-area values
      const el = document.createElement("div");
      el.style.cssText = `
        position: absolute;
        visibility: hidden;
        pointer-events: none;
        padding-top: env(safe-area-inset-top);
        padding-bottom: env(safe-area-inset-bottom);
        padding-left: env(safe-area-inset-left);
        padding-right: env(safe-area-inset-right);
      `;
      document.body.appendChild(el);
      const cs = window.getComputedStyle(el);

      // Get dvh/vh values
      const dvhEl = document.createElement("div");
      dvhEl.style.cssText = "position:absolute;visibility:hidden;height:100dvh;";
      document.body.appendChild(dvhEl);
      const dvhValue = dvhEl.offsetHeight;

      const vhEl = document.createElement("div");
      vhEl.style.cssText = "position:absolute;visibility:hidden;height:100vh;";
      document.body.appendChild(vhEl);
      const vhValue = vhEl.offsetHeight;

      // Measure actual layout elements
      const tabBar = document.querySelector("nav.fixed.bottom-0") as HTMLElement | null;
      const mainEl = document.querySelector("main") as HTMLElement | null;
      const layoutEl = document.querySelector(".fixed.inset-0") as HTMLElement | null;

      setValues({
        innerHeight: window.innerHeight,
        innerWidth: window.innerWidth,
        visualViewportHeight: window.visualViewport?.height || 0,
        visualViewportWidth: window.visualViewport?.width || 0,
        safeAreaTop: cs.paddingTop,
        safeAreaBottom: cs.paddingBottom,
        safeAreaLeft: cs.paddingLeft,
        safeAreaRight: cs.paddingRight,
        oomSafeBottom: getComputedStyle(document.documentElement).getPropertyValue("--oom-safe-bottom") || "0px",
        dvh: `${dvhValue}px`,
        vh: `${vhValue}px`,
        // Layout elements
        tabBarHeight: tabBar?.offsetHeight || 0,
        tabBarBottom: tabBar ? parseInt(getComputedStyle(tabBar).bottom || "0") : 0,
        mainHeight: mainEl?.clientHeight || 0,
        mainScrollHeight: mainEl?.scrollHeight || 0,
        layoutHeight: layoutEl?.clientHeight || 0,
      });

      document.body.removeChild(el);
      document.body.removeChild(dvhEl);
      document.body.removeChild(vhEl);
    };

    update();
    const interval = setInterval(update, 500);

    const vv = window.visualViewport;
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);

    return () => {
      clearInterval(interval);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [debugEnabled]);

  if (!debugEnabled) return null;

  if (!isVisible) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsVisible(true);
        }}
        className="fixed top-2 left-2 z-[9999] bg-black/80 text-white text-[10px] px-2 py-1 rounded font-mono"
      >
        📐 Debug
      </button>
    );
  }

  return (
    <div 
      className="fixed top-2 left-2 z-[9999] bg-black/90 text-white text-[10px] p-3 rounded-lg font-mono leading-relaxed max-w-[200px] shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => setIsVisible(false)}
        className="absolute top-1 right-1 text-white/60 hover:text-white"
      >
        ✕
      </button>
      <div className="font-bold mb-2 text-xs">iOS Debug</div>
      <div className="space-y-1">
        <div className="text-green-400">Window</div>
        <div>innerH: {values.innerHeight}px</div>
        <div>innerW: {values.innerWidth}px</div>
        
        <div className="text-blue-400 mt-2">VisualViewport</div>
        <div>height: {values.visualViewportHeight}px</div>
        <div>width: {values.visualViewportWidth}px</div>
        
        <div className="text-yellow-400 mt-2">100vh / 100dvh</div>
        <div>vh: {values.vh}</div>
        <div>dvh: {values.dvh}</div>
        
        <div className="text-orange-400 mt-2">Safe Area (env)</div>
        <div>top: {values.safeAreaTop}</div>
        <div>bottom: {values.safeAreaBottom}</div>
        <div>left: {values.safeAreaLeft}</div>
        <div>right: {values.safeAreaRight}</div>
        
        <div className="text-pink-400 mt-2">OOM Clamped</div>
        <div>--oom-safe-bottom: {values.oomSafeBottom}</div>
        
        <div className="text-cyan-400 mt-2">Layout Elements</div>
        <div>TabBar H: {values.tabBarHeight}px</div>
        <div>TabBar bottom: {values.tabBarBottom}px</div>
        <div>Main H: {values.mainHeight}px</div>
        <div>Main scrollH: {values.mainScrollHeight}px</div>
        <div>Layout H: {values.layoutHeight}px</div>
      </div>
      <button
        onClick={() => {
          setDebugEnabled(false);
          localStorage.setItem("oom-debug", "false");
        }}
        className="mt-3 w-full bg-red-600 text-white text-[10px] py-1 rounded"
      >
        Désactiver Debug
      </button>
    </div>
  );
};

export default DebugViewportOverlay;
