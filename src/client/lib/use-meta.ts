import { useEffect, useState } from "react";

import type { RecipeMetaResponse } from "../../shared/types";
import { fetchMeta } from "./api";

/** 进程内缓存：两个页面都要用 meta，没必要请求两次 */
let cache: RecipeMetaResponse | null = null;

export interface MetaState {
  meta: RecipeMetaResponse | null;
  /** 请求失败（与"还在载入"区分开：失败要能说"载入失败"而不是一直"载入中"） */
  failed: boolean;
}

/** 取分类、标签与**厨具词表**（/api/meta） */
export function useMeta(): MetaState {
  const [meta, setMeta] = useState<RecipeMetaResponse | null>(cache);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (cache) return;

    const controller = new AbortController();
    fetchMeta(controller.signal)
      .then((response) => {
        cache = response;
        setMeta(response);
        setFailed(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });

    return () => controller.abort();
  }, []);

  return { meta, failed };
}
