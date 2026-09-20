import { useRoute } from "./lib/router";
import { HomePage } from "./pages/HomePage";
import { RecipePage } from "./pages/RecipePage";

export function App(): React.JSX.Element {
  const route = useRoute();

  if (route.name === "recipe") {
    return <RecipePage id={route.id} />;
  }

  return <HomePage />;
}
