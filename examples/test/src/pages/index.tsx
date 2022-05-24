import { useServerSideProps, useFormData } from "@borderless/site";

export default function Home() {
  const data = useServerSideProps();
  const form = useFormData();

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
