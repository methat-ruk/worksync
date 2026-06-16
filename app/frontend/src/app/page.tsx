const readinessItems = [
  "Project foundation documents",
  "API and security model",
  "Testing and deployment strategy",
  "Local service configuration"
];

export default function HomePage() {
  return (
    <main className="grid min-h-screen place-items-center px-6 py-16">
      <section className="max-w-3xl">
        <p className="m-0 font-bold text-blue-600">WorkSync</p>
        <h1 className="my-3 text-5xl font-bold leading-none tracking-tight text-slate-950 md:text-7xl">
          Collaboration workbench foundation
        </h1>
        <p className="text-lg leading-8 text-slate-600">
          The application skeleton is ready for authentication, workspace membership, projects,
          tasks, comments, notifications, and operational hardening.
        </p>
        <ul className="list-disc pl-5 leading-8 text-slate-700">
          {readinessItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
