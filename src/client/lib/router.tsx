import { useEffect, useState } from "react";

export type Route = { name: "home" } | { name: "recipe"; id: string };

export function parseRoute(pathname: string): Route {
  const match = /^\/recipe\/([^/]+)\/?$/.exec(pathname);
  if (match) {
    return { name: "recipe", id: decodeURIComponent(match[1]) };
  }
  return { name: "home" };
}

/** 极简 History 路由：只有两个页面，不引入路由库 */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));

  useEffect(() => {
    const onPopState = (): void => setRoute(parseRoute(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return route;
}

export function navigate(path: string): void {
  const target = path.startsWith("/") ? path : `/${path}`;
  if (target === window.location.pathname + window.location.search) return;
  window.history.pushState(null, "", target);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** 更新地址栏查询参数但不新增历史记录（搜索/筛选状态同步用） */
export function replaceQuery(search: string): void {
  window.history.replaceState(null, "", `${window.location.pathname}${search}`);
}
