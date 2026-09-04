"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ResourceReloadOptions = {
  silent?: boolean;
};

export type ResourceError = Error & {
  status?: number;
};

export type ResourceState<Data> = {
  data: Data | null;
  dataIsCurrent: boolean;
  error: ResourceError | null;
  loading: boolean;
  reload: (options?: ResourceReloadOptions) => Promise<Data | undefined>;
};

export type UseResourceOptions<Data> = {
  onData?: (data: Data) => void;
  onError?: (error: ResourceError) => void;
};

function resourceError(message: string, status?: number): ResourceError {
  const error = new Error(message) as ResourceError;
  error.status = status;
  return error;
}

async function readResponse<Data>(response: Response): Promise<Data> {
  const data = await response.json().catch(() => null) as { error?: unknown } | Data | null;
  if (!response.ok) {
    const message = data && typeof data === "object" && "error" in data && typeof data.error === "string"
      ? data.error
      : `요청을 처리하지 못했습니다. (${response.status})`;
    throw resourceError(message, response.status);
  }
  return data as Data;
}

export function useResource<Data>(
  url: string | null,
  pollInterval = 2500,
  options: UseResourceOptions<Data> = {},
): ResourceState<Data> {
  const requestSequence = useRef(0);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<ResourceError | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [errorUrl, setErrorUrl] = useState<string | null>(null);
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const reload = useCallback(async (options: ResourceReloadOptions = {}) => {
    if (!url) return undefined;

    const requestId = ++requestSequence.current;
    if (!options.silent) setLoading(true);

    try {
      const response = await fetch(url, { cache: "no-store" });
      const nextData = await readResponse<Data>(response);
      if (requestId !== requestSequence.current) return undefined;
      setData(nextData);
      setDataUrl(url);
      setError(null);
      setErrorUrl(null);
      optionsRef.current.onData?.(nextData);
      return nextData;
    } catch (caught) {
      if (requestId !== requestSequence.current) return undefined;
      const nextError = caught instanceof Error
        ? Object.assign(caught, { status: (caught as ResourceError).status }) as ResourceError
        : resourceError("데이터를 불러오지 못했습니다.");
      setError(nextError);
      setErrorUrl(url);
      optionsRef.current.onError?.(nextError);
      return undefined;
    } finally {
      if (requestId === requestSequence.current && !options.silent) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    if (!url) {
      requestSequence.current += 1;
      return;
    }

    const frame = requestAnimationFrame(() => void reload());
    const timer = window.setInterval(() => void reload({ silent: true }), pollInterval);
    const sync = () => void reload({ silent: true });

    window.addEventListener("focus", sync);
    window.addEventListener("online", sync);

    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(timer);
      window.removeEventListener("focus", sync);
      window.removeEventListener("online", sync);
      requestSequence.current += 1;
    };
  }, [pollInterval, reload, url]);

  const dataIsCurrent = url !== null && dataUrl === url;

  return {
    data: url === null ? null : data,
    dataIsCurrent,
    error: url !== null && errorUrl === url ? error : null,
    loading,
    reload,
  };
}
