import React from "react";

export default function Timer() {
  const [passed, setPassed] = React.useState(0);
  const [total, setTotal] = React.useState(0);
  const [running, setRunning] = React.useState(true);
  const [startTime, setStartTime] = React.useState(typeof performance !== "undefined" ? performance.now() : 0);

  const getTotal = () => passed + (performance.now() - startTime);

  React.useEffect(() => {
    if (!running) return;

    const interval = setInterval(() => {
      setTotal(getTotal());
    }, 60);

    return () => clearInterval(interval);
  }, [passed, running]);

  function changeTimer() {
    const pause = running;

    if (pause) {
      const total = getTotal();
      setPassed(total);
      setTotal(total);
    } else {
      setStartTime(performance.now());
    }

    setRunning(!pause);
  }

  return (
    <div style={{ margin: 10 }}>
      {String((total / 1000).toFixed(2))}
      <button onClick={changeTimer}>{running ? "Stop" : "Start"}</button>
    </div>
  );
}
