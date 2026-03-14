import { useState, useEffect, useRef, useCallback } from 'react';
import { UploadCloud, File as FileIcon, Download, CheckCircle, AlertCircle } from 'lucide-react';
import './index.css';

const CHUNK_SIZE = 8192; // 8KB chunks as required
const HOST = window.location.hostname || 'localhost';
const WS_URL = `ws://${HOST}:8080/ws/upload`;
const API_URL = `http://${HOST}:8080/api/files`;

function App() {
  const [files, setFiles] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('idle'); // idle, uploading, success, error
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  
  const wsRef = useRef(null);
  
  useEffect(() => {
    fetchFiles();
  }, []);
  
  const fetchFiles = async () => {
    try {
      const res = await fetch(API_URL);
      if (res.ok) {
        const data = await res.json();
        setFiles(data);
      }
    } catch (error) {
      console.error('Error fetching files:', error);
    }
  };

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (uploadStatus === 'uploading') return;
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      startUpload(e.dataTransfer.files[0]);
    }
  }, [uploadStatus]);
  
  const handleFileInput = (e) => {
    if (uploadStatus === 'uploading') return;
    
    if (e.target.files && e.target.files[0]) {
      startUpload(e.target.files[0]);
    }
  };

  const startUpload = (file) => {
    setCurrentFile(file);
    setUploadStatus('uploading');
    setProgress(0);
    setErrorMsg('');
    
    try {
      const socket = new WebSocket(WS_URL);
      wsRef.current = socket;
      
      socket.onopen = () => {
        // Send metadata first
        socket.send(JSON.stringify({
          type: 'metadata',
          filename: file.name,
          size: file.size
        }));
      };
      
      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'ack' && data.status === 'ready') {
          // Ready to send file chunks
          sendFileChunks(file, socket);
        } else if (data.type === 'progress') {
          setProgress(data.progress || 0);
        } else if (data.type === 'complete_ack') {
          setUploadStatus('success');
          fetchFiles();
          socket.close();
        }
      };
      
      socket.onerror = () => {
        setUploadStatus('error');
        setErrorMsg('Connection error during upload.');
      };
      
      socket.onclose = () => {
        if (progress < 100 && uploadStatus === 'uploading') {
          setUploadStatus('error');
          setErrorMsg('Upload interrupted.');
        }
      };
      
    } catch (e) {
      setUploadStatus('error');
      setErrorMsg('Could not connect to server.');
    }
  };
  
  const sendFileChunks = (file, socket) => {
    let offset = 0;
    
    const readNextChunk = () => {
      if (socket.readyState !== WebSocket.OPEN) return;
      
      if (offset < file.size) {
        const slice = file.slice(offset, offset + CHUNK_SIZE);
        const reader = new FileReader();
        
        reader.onload = (e) => {
          socket.send(e.target.result);
          offset += CHUNK_SIZE;
          
          // Send next chunk immediately to keep buffer full and transfer fast
          readNextChunk(); 
        };
        
        reader.onerror = () => {
          setUploadStatus('error');
          setErrorMsg('Error reading file chunks.');
          socket.close();
        };
        
        reader.readAsArrayBuffer(slice);
      } else {
        // Transfer complete
        socket.send(JSON.stringify({ type: 'complete' }));
      }
    };
    
    readNextChunk();
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="container">
      <div className="header">
        <h1>Gravity Share</h1>
        <div className="subtitle">High-speed file transfer using NIO WebSockets</div>
      </div>
      
      <div className="card">
        <input 
          type="file" 
          id="file-upload" 
          style={{ display: 'none' }} 
          onChange={handleFileInput} 
          disabled={uploadStatus === 'uploading'}
        />
        <label 
          htmlFor="file-upload"
          className={`drop-zone ${dragActive ? 'active' : ''} ${uploadStatus === 'uploading' ? 'disabled' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          {uploadStatus === 'uploading' ? (
            <>
              <UploadCloud className="icon" style={{ transform: 'translateY(-5px)', animation: 'bounce 2s infinite' }} />
              <div>Uploading {currentFile?.name}...</div>
            </>
          ) : uploadStatus === 'success' ? (
            <>
              <CheckCircle className="icon" style={{ color: '#34d399' }} />
              <div>Upload Complete! Drop another file.</div>
            </>
          ) : uploadStatus === 'error' ? (
            <>
              <AlertCircle className="icon" style={{ color: '#f87171' }} />
              <div style={{ color: '#f87171' }}>{errorMsg} Drop again to retry.</div>
            </>
          ) : (
            <>
              <UploadCloud className="icon" />
              <div><strong>Drag and drop</strong> your files here</div>
              <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>or click to browse from your computer</div>
            </>
          )}
        </label>
        
        {uploadStatus === 'uploading' && (
          <div className="progress-container">
            <div className="progress-bar" style={{ width: `${progress}%` }}></div>
            <div className="progress-text" style={{ position: 'absolute', top: '-25px', width: '100%' }}>
              <span>{progress.toFixed(1)}%</span>
            </div>
          </div>
        )}
      </div>
      
      <div className="card">
        <h2 style={{ fontSize: '1.25rem', marginTop: 0, marginBottom: '1.5rem', textAlign: 'left' }}>
          Recently Shared Files
        </h2>
        
        {files.length === 0 ? (
          <div style={{ padding: '2rem', color: '#94a3b8' }}>
            No files have been shared yet.
          </div>
        ) : (
          <div className="file-list">
            {files.map((file, idx) => (
              <div className="file-item" key={idx}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <FileIcon color="#94a3b8" size={32} />
                  <div className="file-info">
                    <span className="file-name">{file.filename || file.name}</span>
                    <span className="file-size">{formatSize(file.size)}</span>
                  </div>
                </div>
                <a 
                  href={`${API_URL}/download/${file.filename || file.name}`} 
                  download 
                  className="download-btn"
                >
                  <Download size={18} />
                  <span>Download</span>
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
