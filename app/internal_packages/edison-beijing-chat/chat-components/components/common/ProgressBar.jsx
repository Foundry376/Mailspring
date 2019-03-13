function ProgressBar(props) {
  const { percent } = props;
  const isDownloading = download ? download.state === 'downloading' : false;
  return (
    <span className='progress-bar-wrap state-downloading'>
      <span className="progress-background" />
      <span className="progress-foreground" style={{
        width: `${Math.min(percent, 97.5)}%`,
      }} />
    </span>
  );
}
ProgressBar.propTypes = propTypes;
