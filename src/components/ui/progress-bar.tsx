import { useEffect, useState } from "react";
import { cn } from "~/lib/utils";

interface ProgressBarProps {
  steps: {
    name: string;
    status: "pending" | "loading" | "completed" | "error";
  }[];
  currentStep?: number;
}

export function ProgressBar({ steps, currentStep = 0 }: ProgressBarProps) {
  const [progress, setProgress] = useState(0);
  
  useEffect(() => {
    const completed = steps.filter(s => s.status === "completed").length;
    const percentage = (completed / steps.length) * 100;
    setProgress(percentage);
  }, [steps]);

  return (
    <div className="w-full">
      {/* Progress bar */}
      <div className="relative mb-6">
        <div className="flex mb-2 items-center justify-between">
          <div>
            <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-blue-600 bg-blue-200">
              {steps[currentStep]?.status === "loading" ? "Loading" : "Progress"}
            </span>
          </div>
          <div className="text-right">
            <span className="text-xs font-semibold inline-block text-blue-600">
              {Math.round(progress)}%
            </span>
          </div>
        </div>
        <div className="overflow-hidden h-2 mb-4 text-xs flex rounded-full bg-blue-100">
          <div
            style={{ width: `${progress}%` }}
            className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500 ease-out"
          />
        </div>
      </div>

      {/* Steps list */}
      <div className="space-y-2">
        {steps.map((step, index) => (
          <div
            key={index}
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg transition-all duration-300",
              step.status === "loading" && "bg-blue-50 border border-blue-200",
              step.status === "completed" && "bg-green-50 border border-green-200",
              step.status === "error" && "bg-red-50 border border-red-200",
              step.status === "pending" && "bg-gray-50 border border-gray-200"
            )}
          >
            <div className="flex-shrink-0">
              {step.status === "loading" && (
                <svg className="animate-spin h-5 w-5 text-blue-600" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              )}
              {step.status === "completed" && (
                <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {step.status === "error" && (
                <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              {step.status === "pending" && (
                <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
            <div className="flex-1">
              <p className={cn(
                "text-sm font-medium",
                step.status === "loading" && "text-blue-900",
                step.status === "completed" && "text-green-900",
                step.status === "error" && "text-red-900",
                step.status === "pending" && "text-gray-600"
              )}>
                {step.name}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}