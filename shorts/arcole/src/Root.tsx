import React from "react";
import { Composition } from "remotion";
import { Bridge } from "./videos/arcole/Bridge";
import { FPS, TOTAL } from "./videos/arcole/story";

export const Root: React.FC = () => (
  <Composition id="ArcoleShort" component={Bridge} durationInFrames={TOTAL} fps={FPS} width={720} height={1280} />
);
