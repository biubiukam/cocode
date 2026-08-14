/**
 * `@cocode/ui` — the design tokens and the local UI primitives.
 *
 * Primitives derived from shadcn/ui are vendored source, not a dependency: they
 * were rewritten against `tokens.css` and are ours to evolve (design system §11
 * principle 4). Every color reaches a component through a semantic alias.
 */

export { cn } from './lib/cn.ts'

export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from './components/button.tsx'
export { IconButton, type IconButtonProps, type IconButtonSize } from './components/icon-button.tsx'
export { Badge, type BadgeProps, type BadgeTone } from './components/badge.tsx'
export { Field, Input } from './components/input.tsx'
export { Toast } from './components/toast.tsx'
export { Skeleton, SkeletonText } from './components/skeleton.tsx'
export { EmptyState, type EmptyStateProps } from './components/empty-state.tsx'
export { Segmented, type SegmentedOption, type SegmentedProps } from './components/segmented.tsx'
export { Spinner } from './components/spinner.tsx'
export {
  Dialog,
  DialogActions,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from './components/dialog.tsx'
export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  type DropdownMenuItemProps,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './components/dropdown-menu.tsx'
export {
  FilterSelect,
  Select,
  SelectOption,
  SelectPopover,
  SelectPopoverLabel,
  SelectPopoverOptions,
  useSelectPopover,
  type FilterSelectProps,
  type SelectChoice,
  type SelectProps,
} from './components/select.tsx'
export { Tooltip, TooltipProvider } from './components/tooltip.tsx'
