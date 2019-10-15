import React, { PureComponent } from 'react'
import CancelIcon from './icons/CancelIcon'
import path from 'path'
import { RetinaImg } from 'mailspring-component-kit'
import { ProgressBarStore, MessageStore, ChatActions } from 'chat-exports'

const remote = require('electron').remote
const shell = remote.shell

export default class ProgressBar extends PureComponent {
  constructor (props) {
    super(props)
  }

  state = {}

  hide = () => {
    let loading = ProgressBarStore.progress.loading
    const failed = ProgressBarStore.progress.failed
    if (ProgressBarStore.progress.finished || failed) {
      loading = false
    }
    ChatActions.updateProgress({ loading, visible: false })
  }

  viewDownload = () => {
    const { progress } = this.props
    const { loadConfig } = progress
    shell.showItemInFolder(loadConfig.filepath)
  }

  minimize = () => {
    this.setState({ minimized: true })
  }

  restoreFromMinimized = () => {
    if (this.state.minimized) {
      this.setState({ minimized: false })
    }
  }

  render () {
    const { progress, onCancel, onRetry } = this.props
    const { minimized } = this.state
    const { loadConfig, percent, visible, failed, offline, loading, finished } = progress

    if (!loadConfig || !visible) {
      return null
    }

    let loadWord, loadText
    const filename = path.basename(loadConfig.filepath)
    if (loadConfig.type === 'download') {
      loadWord = 'Downloading'
      loadText = 'was saved to your computer'
    } else {
      loadWord = 'Uploading'
      loadText = 'was uploaded to the web'
    }
    let status = ''
    if (failed) {
      status = '(failed)'
    }
    if (offline) {
      status = '(offline)'
    }
    let containerClassName
    if (minimized) {
      containerClassName = 'progress-container minimized'
    } else {
      containerClassName = 'progress-container'
    }
    return (
      <div className={containerClassName} onClick={this.restoreFromMinimized}>
        <div className='progress-banner'>
          {!finished ? (
            <RetinaImg
              className={'download-btn'}
              name={loadConfig.type === 'download' ? 'download.svg' : 'upload.svg'}
              isIcon
              mode={RetinaImg.Mode.ContentIsMask}
            />
          ) : (
            <RetinaImg className={'download-btn'} name={'check-alone.svg'} isIcon mode={RetinaImg.Mode.ContentIsMask} />
          )}

          {!minimized ? (
            <div className='load-info'>
              <div className='progress-prompt'>
                {!finished ? `${loadWord} "${filename}"${status}` : `"${filename}" ${loadText}`}
              </div>

              {!finished ? (
                <div className='msg-progress-bar-wrap'>
                  <div className='progress-background' />
                  <div className='progress-foreground' style={{ width: `${Math.min(percent, 100)}%` }} />
                </div>
              ) : null}
            </div>
          ) : null}
          <div className='progressButtons'>
            {finished ? (
              loadConfig.type === 'download' ? (
                <div className='cancelButton' onClick={this.viewDownload}>
                  View
                </div>
              ) : null
            ) : !offline && failed ? (
              <div className='cancelButton' onClick={onRetry}>
                Retry
              </div>
            ) : (
              <div className='cancelButton' onClick={onCancel}>
                Cancel
              </div>
            )}
            {!finished && !minimized ? (
              <span className='minimizeButton' color='rgba(0,0,0,0.2)' onClick={this.minimize}>
                -
              </span>
            ) : null}
            <CancelIcon color='rgba(0,0,0,0.2)' onClick={this.hide} />
          </div>
          <div />
        </div>
      </div>
    )
  }
}
