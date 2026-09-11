import {Composition} from "remotion";
import {RoomiLaunch} from "./RoomiLaunch";

export const RemotionRoot = () => {
  return (
    <Composition
      id="RoomiLaunch"
      component={RoomiLaunch}
      durationInFrames={1800}
      fps={60}
      width={1920}
      height={1080}
    />
  );
};
