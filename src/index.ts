import { useContext } from "react";
import { PageDataContext, PageData } from "./shared.js";

/**
 * Access to the server-side props.
 */
export function useServerSideProps<T extends object>(): T {
  return (useContext(PageDataContext) as PageData).props as T;
}

/**
 * Access to the result of form submission.
 */
export function useFormData<T>(): T | undefined {
  return (useContext(PageDataContext) as PageData).formData as T | undefined;
}
