import fs from 'fs';
import temp from 'temp';
import { shell } from 'electron';
import React from 'react';
import { PropTypes, RegExpUtils } from 'mailspring-exports';

interface FormErrorProps {
  message: string;
  log: string;
  empty: boolean;
}

const FormErrorMessage = (props: FormErrorProps) => {
  const { message, log, empty } = props;
  if (!message) {
    return <div className="message empty">{empty}</div>;
  }

  let rawLogLink: React.ReactChild = null;
  if (log && log.length > 0) {
    const onViewLog = () => {
      const logPath = temp.path({ suffix: '.log' });
      fs.writeFileSync(logPath, log);
      shell.openItem(logPath);
    };
    rawLogLink = (
      <a href="" onClick={onViewLog} style={{ paddingLeft: 5 }}>
        View Log
      </a>
    );
  }

  if (typeof message === 'string') {
    const linkMatch = RegExpUtils.urlRegex().exec(message);
    if (linkMatch) {
      const link = linkMatch[0];
      return (
        <div className="message error">
          {message.substr(0, linkMatch.index)}
          <a href={link}>{link}</a>
          {message.substr(linkMatch.index + link.length)}
          {rawLogLink}
        </div>
      );
    }
  }

  return (
    <div className="message error">
      {message}
      {rawLogLink}
    </div>
  );
};

FormErrorMessage.propTypes = {
  empty: PropTypes.oneOfType([PropTypes.string, PropTypes.element]),
  message: PropTypes.oneOfType([PropTypes.string, PropTypes.element]),
};

export default FormErrorMessage;
