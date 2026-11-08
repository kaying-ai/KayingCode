import {
  authorizeTapTap,
  checkMakerSetup,
  initMakerProject,
  inspectMakerProjectDirectory,
  listMakerCliCapabilities,
  type MakerCommandResult,
  restoreClobberedMakerMetadata,
  runMakerCliAction,
  type SubmitToTapTapInput,
  type SubmitToTapTapResult,
  submitToTapTap,
} from "../maker/index";

export type MakerCliResult = MakerCommandResult;
export type { SubmitToTapTapInput, SubmitToTapTapResult };

export {
  authorizeTapTap,
  checkMakerSetup,
  initMakerProject,
  inspectMakerProjectDirectory,
  listMakerCliCapabilities,
  restoreClobberedMakerMetadata,
  runMakerCliAction,
  submitToTapTap,
};
