import { Component, type ErrorInfo, type ReactNode } from "react";
import { api } from "../api";
import { Logo } from "./Logo";

interface State { error?: Error }

export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State { return { error }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void api.reportFrontendError(`${error.stack || error.message}\n${info.componentStack || ""}`);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const chinese = navigator.language.toLowerCase().startsWith("zh");
    return <main className="fatalState"><Logo /><h1>{chinese ? "界面暂时无法显示" : "The interface could not be displayed"}</h1><p>{chinese ? "错误已记录。重新加载不会影响素材文件。" : "The error was logged. Reloading will not affect your media files."}</p><button className="primaryButton" onClick={() => window.location.reload()}>{chinese ? "重新加载" : "Reload"}</button></main>;
  }
}
