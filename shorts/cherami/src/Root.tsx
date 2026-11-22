import React from "react";
import { Composition } from "remotion";
import { Bridge } from "./videos/cherami/Bridge";
import { FPS, TOTAL } from "./videos/cherami/story";

export const Root: React.FC = () => (
  <Composition id="CherAmiShort" component={Bridge} durationInFrames={TOTAL} fps={FPS} width={720} height={1280} />
);
