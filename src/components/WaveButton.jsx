import React from "react";

export default function WaveButton({ onWave }) {
  return (
    <button className="wave-button" onClick={onWave} type="button">
      👋 Wave
    </button>
  );
}