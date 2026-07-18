import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { api } from "../api";
import type { NavigationFilter } from "../store";
import type { AssetQuery } from "../types";

export function useLibraryQueries(navigation: NavigationFilter, search: string, sort: AssetQuery["sort"]) {
  const bootstrap = useQuery({ queryKey: ["bootstrap"], queryFn: api.getBootstrap });
  const jobs = useQuery({
    queryKey: ["jobs"],
    queryFn: api.getRecentJobs,
    staleTime: 0,
    refetchInterval: (query) => query.state.data?.some((item) => item.status === "running" || item.status === "paused") ? 900 : false,
  });
  const assetFilter = useMemo<AssetQuery>(() => {
    const query: AssetQuery = { limit: 120, search: search || undefined, sort };
    if (navigation.kind === "media") query.mediaKind = navigation.mediaKind;
    if (navigation.kind === "source") query.sourceId = navigation.id;
    if (navigation.kind === "tag") query.tagId = navigation.id;
    if (navigation.kind === "collection") query.collectionId = navigation.id;
    return query;
  }, [navigation, search, sort]);
  const assets = useInfiniteQuery({
    queryKey: ["assets", assetFilter],
    queryFn: ({ pageParam }) => api.listAssets({ ...assetFilter, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
  const items = useMemo(() => assets.data?.pages.flatMap((page) => page.items) ?? [], [assets.data]);
  return { bootstrap, jobs, assets, items, total: assets.data?.pages[0]?.total ?? 0 };
}
