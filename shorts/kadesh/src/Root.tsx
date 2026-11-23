import React from "react";
import { Composition } from "remotion";
import { Bridge } from "./videos/kadesh/Bridge";
import { FPS, TOTAL } from "./videos/kadesh/story";

export const Root: React.FC = () => (
  <Composition id="KadeshShort" component={Bridge} durationInFrames={TOTAL} fps={FPS} width={720} height={1280} />
);
