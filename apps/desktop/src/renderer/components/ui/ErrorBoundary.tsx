import { AlertCircle, RefreshCw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "./Button";

interface Props {
  // What failed, as a sentence start: "The fix plan", "Benchmark readiness".
  name: string;
  // What went wrong, before the hint.
  detail?: string;
  // What else the user can do, after "Try again".
  hint?: string;
  // Shown above the fallback, so a failed screen keeps its header.
  header?: ReactNode;
  // A new value renders the children again, for example a new comparison.
  resetKey?: string;
  children: ReactNode;
}

// Keeps a render error inside the part that failed: the fallback names that
// part and offers Try again, which renders it once more. A malformed result
// can then never blank the whole window.
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`${this.props.name} could not be shown.`, error, info.componentStack);
  }

  componentDidUpdate(previous: Props) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="space-y-5">
        {this.props.header}
        <div role="alert" className="shadow-card flex items-start gap-3 rounded-2xl border border-red-200 bg-white p-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-sm font-semibold text-red-900">{this.props.name} could not be shown</p>
            <p className="text-petrol-700 mt-1 max-w-3xl text-[13px] leading-5">
              {this.props.detail ?? "Part of the data could not be displayed."} {this.props.hint ?? "Try again."}
            </p>
            <div className="mt-3">
              <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => this.setState({ error: null })}>
                Try again
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
