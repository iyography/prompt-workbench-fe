import React from "react";

interface ProgressBarProps {
  pendingTasks: string[];
  totalTasksInitiated: number;
  completedTasks?: number;
  totalDataFields?: number;
}

export function ProgressBar({ pendingTasks, totalTasksInitiated, completedTasks: providedCompletedTasks, totalDataFields }: ProgressBarProps) {
  // Use provided completedTasks if available, otherwise calculate from pending tasks
  const completedTasks = providedCompletedTasks ?? (totalTasksInitiated - pendingTasks.length);
  const percentComplete = totalTasksInitiated > 0
    ? Math.round((completedTasks / totalTasksInitiated) * 100)
    : 0;

  return (
    <div className="mt-2 mb-4">
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-medium text-gray-700">
          {totalDataFields ? (
            <>Data Fields Loaded: {totalDataFields} • Smart Variables: {completedTasks} of {totalTasksInitiated} ({percentComplete}%)</>
          ) : (
            <>Research Completed: {completedTasks} of {totalTasksInitiated} ({percentComplete}%)</>
          )}
        </span>
      </div>

      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div
          className={`h-2.5 rounded-full ${pendingTasks.length > 0 || totalTasksInitiated === 0 ? 'bg-indigo-700' : 'bg-green-700'}`}
          style={{ width: `${percentComplete}%` }}
        ></div>
      </div>
    </div>
  );
}