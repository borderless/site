import useSwr from "swr";
import { useLoader, useFormData } from "@borderless/site";

export default function Home() {
  const loader = useLoader();
  const form = useFormData();
  const { data } = useSwr([true], loader);

  return (
    <div>
      Data: {JSON.stringify(data)}
      <form method="post">
        <label>
          Enter name:
          <input name="name"></input>
        </label>
        <button type="submit">Submit</button>
      </form>
      Form: {JSON.stringify(form)}
    </div>
  );
}
