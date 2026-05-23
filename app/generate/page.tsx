import GenerateForm from "./GenerateForm";

export default function GeneratePage() {
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Generate Suggestions</h2>
        <p className="text-sm text-muted">
          This tool does not predict winners. It produces combinations based on configurable constraints
          and recent draw patterns.
        </p>
      </div>
      <GenerateForm />
    </section>
  );
}
