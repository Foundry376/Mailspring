import React from 'react';
import PropTypes from 'prop-types';
import { RetinaImg } from './retina-img';
import { localized } from '../intl';

interface PDFViewerProps {
  filePath: string;
  displayName: string;
  onClose: () => void;
}

interface PDFViewerState {
  isLoading: boolean;
  error: string | null;
  isExpanded: boolean;
}

export default class PDFViewer extends React.Component<PDFViewerProps, PDFViewerState> {
  static displayName = 'PDFViewer';

  static propTypes = {
    filePath: PropTypes.string.isRequired,
    displayName: PropTypes.string.isRequired,
    onClose: PropTypes.func.isRequired,
  };

  private _iframeRef: React.RefObject<HTMLIFrameElement>;

  constructor(props: PDFViewerProps) {
    super(props);
    this.state = {
      isLoading: true,
      error: null,
      isExpanded: true,
    };
    this._iframeRef = React.createRef();
  }

  componentDidMount() {
    // Only load PDF when expanded
    if (this.state.isExpanded) {
      this._loadPDF();
    }
  }

  componentDidUpdate(prevProps: PDFViewerProps, prevState: PDFViewerState) {
    // Load PDF when transitioning from compact to expanded
    if (!prevState.isExpanded && this.state.isExpanded) {
      this._loadPDF();
    }
  }

  _loadPDF = () => {
    const { filePath } = this.props;

    // Check if file exists
    const fs = require('fs');
    if (!fs.existsSync(filePath)) {
      this.setState({
        isLoading: false,
        error: localized('PDF file not found')
      });
      return;
    }

    // Load PDF in iframe
    if (this._iframeRef.current) {
      this._iframeRef.current.onload = this._onPDPLoaded;
      this._iframeRef.current.onerror = this._onPDFError;

      this._iframeRef.current.src = this._buildPDFJSViewerURL(filePath);
    }
  };

  _buildPDFJSViewerURL = (filePath: string) => {
    const path = require('path');

    const filesRoot = __dirname.replace('app.asar', 'app.asar.unpacked');
    const viewerPath = path.join(filesRoot, '..', 'quickpreview', 'pdfjs-4.3.136', 'web', 'viewer.html');

    const normalizedViewerPath = viewerPath.replace(/\\/g, '/');
    const normalizedFilePath = filePath.replace(/\\/g, '/');
    const encodedFileURL = encodeURIComponent(`file://${normalizedFilePath}`);

    return `file://${normalizedViewerPath}?file=${encodedFileURL}`;
  };

  _onPDPLoaded = () => {
    this.setState({ isLoading: false });
  };

  _onPDFError = () => {
    this.setState({
      isLoading: false,
      error: localized('Failed to load PDF')
    });
  };

  _toggleExpanded = () => {
    this.setState({ isExpanded: !this.state.isExpanded });
  };

  render() {
    const { displayName, onClose } = this.props;
    const { isLoading, error, isExpanded } = this.state;

    if (!isExpanded) {
      return (
        <div
          className="pdf-viewer-compact"
          onClick={this._toggleExpanded}
          style={{
            marginTop: 20,
            marginBottom: 20,
            border: '1px solid #d9dce1',
            borderRadius: '8px',
            padding: '14px 16px',
            cursor: 'pointer',
            background: '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            width: '100%',
            fontSize: '14px',
            fontWeight: 500,
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
          }}
        >
          <RetinaImg name="file-pdf.png" mode={RetinaImg.Mode.ContentPreserve} />
          <span style={{ marginLeft: '12px', fontSize: '14px', color: '#182230' }}>{displayName}</span>
          <div style={{
            marginLeft: 'auto',
            fontSize: '12px',
            background: '#2b6cb0',
            color: '#fff',
            padding: '6px 10px',
            borderRadius: '4px',
            fontWeight: 600
          }}>
            Open preview
          </div>
        </div>
      );
    }

    // Expanded view (large inline panel in message body)
    return (
      <div
        className="pdf-viewer-expanded"
        style={{
          width: '100%',
          marginTop: 20,
          marginBottom: 20,
          border: '1px solid #d9dce1',
          borderRadius: 10,
          background: '#fff',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div className="pdf-viewer-header" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          background: '#f8fafc',
          borderBottom: '1px solid #ddd'
        }}>
          <div className="pdf-viewer-title" style={{
            display: 'flex',
            alignItems: 'center',
            fontWeight: 600,
            color: '#333'
          }}>
            <RetinaImg name="file-pdf.png" mode={RetinaImg.Mode.ContentPreserve} />
            <span style={{ marginLeft: '8px' }}>{displayName}</span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div
              className="pdf-viewer-collapse"
              onClick={this._toggleExpanded}
              style={{
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '4px',
                background: '#e9ecef',
                fontSize: '12px'
              }}
            >
              ↓ Collapse
            </div>
            <div className="pdf-viewer-close" onClick={onClose} style={{
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              background: '#dc3545',
              color: 'white'
            }}>
              ✕ Close
            </div>
          </div>
        </div>

        <div className="pdf-viewer-content" style={{
          position: 'relative',
          height: '75vh',
          minHeight: 520,
          maxHeight: 960,
          padding: '12px',
          background: '#fff',
          overflow: 'hidden',
        }}>
          {isLoading && (
            <div style={{
              position: 'absolute',
              inset: 12,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#666',
              zIndex: 1,
              background: 'rgba(255, 255, 255, 0.92)',
              borderRadius: 6,
            }}>
              <RetinaImg
                name="inline-loading-spinner.gif"
                mode={RetinaImg.Mode.ContentDark}
                style={{ width: 24, height: 24 }}
              />
              <span style={{ marginTop: '12px' }}>{localized('Loading PDF...')}</span>
            </div>
          )}

          {error && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#dc3545',
            }}>
              <RetinaImg name="warning-icon.png" mode={RetinaImg.Mode.ContentPreserve} />
              <span style={{ marginTop: '12px' }}>{error}</span>
            </div>
          )}

          {!error && (
            <iframe
              ref={this._iframeRef}
              className="pdf-iframe"
              title={`PDF: ${displayName}`}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: '#fff',
                visibility: isLoading ? 'hidden' : 'visible',
              }}
            />
          )}
        </div>
      </div>
    );
  }
}
