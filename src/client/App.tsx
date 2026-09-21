import { useRoute } from "./lib/router";
import { EditRecipePage } from "./pages/EditRecipePage";
import { HomePage } from "./pages/HomePage";
import { RecipeHistoryPage, RecipeHistoryVersionPage } from "./pages/RecipeHistoryPage";
import { RecipePage } from "./pages/RecipePage";

export function App(): React.JSX.Element {
  const route = useRoute();

  switch (route.name) {
    case "recipe":
      return <RecipePage id={route.id} />;
    case "edit":
      return <EditRecipePage id={route.id} />;
    case "history":
      return <RecipeHistoryPage id={route.id} />;
    case "historyVersion":
      return <RecipeHistoryVersionPage id={route.id} historyId={route.historyId} />;
    default:
      return <HomePage />;
  }
}
