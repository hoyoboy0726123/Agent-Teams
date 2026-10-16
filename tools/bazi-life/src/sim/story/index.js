// Every yearly event, in the order they are checked each year: the times first (they set the scene), then the
// calibrated core, then the story lines by stage of life.
import { CORE, deathEvent } from "./core.js";
import { WORK } from "./work.js";
import { ERA } from "./era.js";
import { CHILD } from "./child.js";
import { TEEN } from "./teen.js";
import { YOUNG } from "./young.js";
import { ADULT } from "./adult.js";
import { LATER } from "./later.js";
import { HEALTH } from "./health.js";

export const ALL_EVENTS = [...ERA, ...CORE, ...WORK, ...CHILD, ...TEEN, ...YOUNG, ...ADULT, ...LATER, ...HEALTH];
export const MODULES = { ERA, CORE, WORK, CHILD, TEEN, YOUNG, ADULT, LATER, HEALTH };
export { deathEvent };
