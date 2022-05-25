import { useContext } from "react";
import { PageDataContext, DataLoaderContext, PageData } from "./shared.js";

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

/**
 * Access the data loader method, for use with something like `swr`.
 */
export function useLoader() {
  return useContext(DataLoaderContext);
}
