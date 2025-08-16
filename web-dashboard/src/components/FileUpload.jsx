import React, { useState, useRef } from 'react';
import './FileUpload.css';

const FileUpload = ({ onFileUploaded, isUploading }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  const allowedExtensions = ['.gcode', '.gco', '.g', '.nc'];
  const maxFileSize = 500 * 1024 * 1024; // 500MB

  const validateFile = (file) => {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!allowedExtensions.includes(ext)) {
      throw new Error(`Invalid file type. Allowed: ${allowedExtensions.join(', ')}`);
    }
    
    if (file.size > maxFileSize) {
      throw new Error('File too large. Maximum size is 500MB');
    }
    
    return true;
  };

  const handleFileSelect = (files) => {
    const file = files[0];
    if (!file) return;

    try {
      validateFile(file);
      setSelectedFile(file);
    } catch (error) {
      alert(error.message);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    handleFileSelect(files);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleFileInputChange = (e) => {
    handleFileSelect(e.target.files);
  };

  const handleUpload = () => {
    if (selectedFile && onFileUploaded) {
      onFileUploaded(selectedFile);
    }
  };

  const handleBrowse = () => {
    fileInputRef.current?.click();
  };

  const clearFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="file-upload-container">
      <div 
        className={`file-drop-zone ${isDragOver ? 'drag-over' : ''} ${selectedFile ? 'file-selected' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={!selectedFile ? handleBrowse : undefined}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileInputChange}
          accept=".gcode,.gco,.g,.nc"
          style={{ display: 'none' }}
        />
        
        {!selectedFile ? (
          <div className="drop-zone-content">
            <div className="drop-zone-icon">
              📁
            </div>
            <h3>Drop your G-code file here</h3>
            <p>or click to browse</p>
            <div className="supported-formats">
              Supported: {allowedExtensions.join(', ')} (max 500MB)
            </div>
          </div>
        ) : (
          <div className="file-selected-content">
            <div className="file-icon">
              📄
            </div>
            <div className="file-info">
              <h4>{selectedFile.name}</h4>
              <p className="file-size">{formatFileSize(selectedFile.size)}</p>
              <p className="file-type">
                Type: {selectedFile.name.split('.').pop().toUpperCase()} file
              </p>
            </div>
            <button 
              className="clear-file-btn"
              onClick={clearFile}
              disabled={isUploading}
            >
              ✕
            </button>
          </div>
        )}
      </div>
      
      {selectedFile && (
        <div className="upload-actions">
          <button 
            className="upload-btn primary"
            onClick={handleUpload}
            disabled={isUploading}
          >
            {isUploading ? (
              <>
                <span className="spinner"></span>
                Analyzing...
              </>
            ) : (
              'Start Analysis'
            )}
          </button>
          <button 
            className="clear-btn secondary"
            onClick={clearFile}
            disabled={isUploading}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
};

export default FileUpload;
