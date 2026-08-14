import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merges conditional class names and resolves Tailwind conflicts last-wins.
 * @param inputs - class values in cascade order.
 * @returns the merged class attribute value.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
