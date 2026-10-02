import React, { useState } from 'react';

// Exercises the host's error handling: a render error shows the loader's error card, with
// stack frames pointing at this file's line numbers.
function Broken() {
  const thread = null;
  return <div>{thread.subject}</div>;
}

export default function ErrorDemo() {
  const [broken, setBroken] = useState(new URLSearchParams(location.hash.slice(1)).has('throw'));
  return (
    <div className="p-6 text-ms-text">
      <h1 className="text-xl font-semibold text-ms-heading mb-2">Error Demo</h1>
      <button className="px-3 py-1 rounded border border-ms-border" onClick={() => setBroken(true)}>
        Throw during render
      </button>
      {broken && <Broken />}
    </div>
  );
}
