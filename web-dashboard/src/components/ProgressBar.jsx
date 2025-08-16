import React from 'react';
import './ProgressBar.css';

const ProgressBar = ({ 
  progress = 0, 
  stage = '', 
  isComplete = false, 
  hasError = false, 
  errorMessage = '', 
  showPercentage = true 
}) => {
  const getProgressBarClass = () => {
    let className = 'progress-bar';
    if (hasError) className += ' error';
    else if (isComplete) className += ' complete';
    return className;
  };

  const getProgressText = () => {
    if (hasError) return `Error: ${errorMessage}`;
    if (isComplete) return 'Analysis Complete!';
    if (stage) return stage;
    return 'Processing...';
  };

  const getProgressIcon = () => {
    if (hasError) return '⚠️';
    if (isComplete) return '✅';
    return '🔄';
  };

  return (
    <div className="progress-container">
      <div className="progress-header">
        <span className="progress-icon">{getProgressIcon()}</span>
        <span className="progress-text">{getProgressText()}</span>
        {showPercentage && !hasError && (
          <span className="progress-percentage">{Math.round(progress)}%</span>
        )}
      </div>
      
      <div className="progress-bar-container">
        <div className={getProgressBarClass()}>
          <div 
            className="progress-bar-fill"
            style={{ width: `${hasError ? 100 : progress}%` }}
          />
        </div>
      </div>
      
      {stage && !hasError && !isComplete && (
        <div className="progress-stage">
          Current stage: {stage}
        </div>
      )}
    </div>
  );
};

export default ProgressBar;
