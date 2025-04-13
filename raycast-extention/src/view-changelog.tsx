import {
  ActionPanel,
  Action,
  List,
  Detail,
  Toast,
  showToast,
  Icon,
  getPreferenceValues,
} from "@raycast/api";
import { useState, useEffect } from "react";
import { loadChangelog, updateChangelog } from "./utils/changelog";

interface Preferences {
  apiKey: string;
}

export default function ViewChangelog() {
  const [entries, setEntries] = useState<{ version: string; description: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  
  const preferences = getPreferenceValues<Preferences>();
  
  useEffect(() => {
    async function fetchChangelog() {
      try {
        const data = loadChangelog();
        setEntries(data);
      } catch (error) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to load changelog",
          message: String(error),
        });
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchChangelog();
  }, []);
  
  const filteredEntries = entries.filter(
    (entry) =>
      entry.version.toLowerCase().includes(searchText.toLowerCase()) ||
      entry.description.toLowerCase().includes(searchText.toLowerCase())
  );
  
  const refreshChangelog = async () => {
    setIsLoading(true);
    
    try {
      const toast = await showToast({
        style: Toast.Style.Animated,
        title: "Updating changelog",
      });
      
      const data = await updateChangelog(preferences.apiKey);
      setEntries(data);
      
      toast.style = Toast.Style.Success;
      toast.title = "Changelog updated";
      toast.message = `Found ${data.length} entries`;
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to update changelog",
        message: String(error),
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search by version or description"
      onSearchTextChange={setSearchText}
      throttle
    >
      {filteredEntries.length === 0 ? (
        <List.EmptyView
          icon={Icon.Minus}
          title="No changelog entries found"
          description={
            entries.length === 0
              ? "Try updating the changelog database with the 'Update Changelog' command."
              : "Try a different search term."
          }
        />
      ) : (
        filteredEntries.map((entry) => (
          <List.Item
            key={entry.version}
            title={entry.version}
            subtitle={entry.description.length > 60 ? `${entry.description.substring(0, 60)}...` : entry.description}
            actions={
              <ActionPanel>
                <Action.Push
                  title="View Details"
                  icon={Icon.Eye}
                  target={<ChangelogDetail version={entry.version} description={entry.description} />}
                />
                <Action
                  title="Update Changelog"
                  icon={Icon.Download}
                  onAction={refreshChangelog}
                  shortcut={{ modifiers: ["cmd"], key: "r" }}
                />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}

function ChangelogDetail({ version, description }: { version: string; description: string }) {
  // Format the markdown for the Detail view
  const markdown = `# Cursor ${version}\n\n${description}`;
  
  return (
    <Detail
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard
            title="Copy Version"
            content={version}
            shortcut={{ modifiers: ["cmd"], key: "c" }}
          />
          <Action.CopyToClipboard
            title="Copy Description"
            content={description}
            shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
          />
        </ActionPanel>
      }
    />
  );
} 