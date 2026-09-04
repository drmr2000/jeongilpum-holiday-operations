"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "./Button";

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  weekday: "short",
});

const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

type OperationsPageHeaderProps = {
  title: string;
  description: string;
  href: string;
  actions?: ReactNode;
};

export function OperationsPageHeader({ title, description, href, actions }: OperationsPageHeaderProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const signOut = () => {
    void fetch("/api/operator-session", { method: "DELETE" }).then(() => window.location.reload());
  };

  return (
    <header className="ops-header">
      <a href={href} className="ops-brand">
        <Image
          className="operations-brand-logo"
          src="/jeongilpum-logo.png"
          alt="정일품 정육식당 로고"
          width={46}
          height={46}
        />
        <span>
          {title}
          <small>{description}</small>
        </span>
      </a>
      <div className="ops-header__utility">
        <time className="ops-header__date" dateTime={now?.toISOString()}>{now ? dateFormatter.format(now) : ""}</time>
        <time className="ops-header__time" dateTime={now?.toISOString()}>{now ? timeFormatter.format(now) : ""}</time>
        {actions ? <div className="ops-alerts">{actions}</div> : null}
        <Button className="ops-header__logout" size="sm" variant="ghost" onClick={signOut}>로그아웃</Button>
      </div>
    </header>
  );
}
