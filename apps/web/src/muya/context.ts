import type { Muya } from '@muyajs/core';

// The native commands and input handlers share the active article's editor
// and editing permissions. Persistence and navigation belong to the workbench.
export interface WritingContext {
  readonly muya: Muya;
  readonly dom: HTMLElement;
  readonly isEditable: boolean;
  readonly composing: boolean;
  readonly generation: number;
  focus(end?: boolean): void;
}
export type NativeSelection = NonNullable<
  ReturnType<Muya['editor']['selection']['getSelection']>
>;
export type ContentBlock = NativeSelection['focusBlock'];
