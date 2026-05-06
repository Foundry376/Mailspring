import React from 'react';

export default function CodeSnippet(props: {
  intro?: string;
  code?: string;
  className?: string;
}) {
  return (
    <div className={props.className}>
      {props.intro}
      <br />
      <br />
      <textarea disabled value={props.code} />
    </div>
  );
}
