import * as React from "react";
import { render } from "react-dom";

import { TransitionGroup } from "./TransitionGroup2";

import "./styles.css";

function makeKey() {
  return Math.random()
    .toString(36)
    .slice(2);
}

function makeInteger(max: number) {
  return Math.floor(Math.random() * max);
}

function makeColor() {
  return `rgb(${makeInteger(256)}, ${makeInteger(256)}, ${makeInteger(256)})`;
}

function makeSquare() {
  return {
    key: makeKey(),
    color: makeColor()
  };
}

function App() {
  const [squares, setSquares] = React.useState(
    Array.from(new Array(3), () => makeSquare())
  );
  const onClick = React.useCallback(
    _key => () =>
      setSquares(_squares => _squares.filter(({ key }) => key !== _key)),
    []
  );
  const addSquare = React.useCallback(() => {
    setSquares(_squares => {
      const newSquares = [..._squares];
      newSquares.splice(
        Math.floor(Math.random() * newSquares.length),
        0,
        makeSquare()
      );
      return newSquares;
    });
  }, []);

  return (
    <div className="App">
      <h1>Hello CodeSandbox</h1>
      <h2>Start editing to see some magic happen!</h2>

      <button onClick={addSquare}>Add square</button>

      <TransitionGroup
        transitionEnterTimeout={1000}
        transitionLeaveTimeout={1000}
        transitionName="transition"
      >
        {squares.map(({ color, key }) => (
          <div
            key={key}
            className="square"
            style={{ backgroundColor: color }}
            onClick={onClick(key)}
          />
        ))}
      </TransitionGroup>
    </div>
  );
}

const rootElement = document.getElementById("root");
render(<App />, rootElement);
