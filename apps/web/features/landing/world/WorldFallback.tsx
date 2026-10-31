"use client";

import { Component } from "react";
import type { ReactNode } from "react";

export class WorldErrorBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch() {
    this.props.onError();
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function CssInstrumentFallback() {
  return (
    <div className="chron-world-fallback" aria-hidden="true">
      <div className="chron-world-fallback__instrument">
        <div className="chron-world-fallback__paper chron-world-fallback__paper--rear" />
        <div className="chron-world-fallback__paper chron-world-fallback__paper--middle" />
        <div className="chron-world-fallback__paper chron-world-fallback__paper--front" />
        <div className="chron-world-fallback__ring">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <svg viewBox="0 0 100 100" focusable="false" aria-hidden="true">
            <path d="M17 67 C27 58 34 62 43 52 S57 39 65 34 S77 27 84 22" />
          </svg>
        </div>
      </div>
    </div>
  );
}
