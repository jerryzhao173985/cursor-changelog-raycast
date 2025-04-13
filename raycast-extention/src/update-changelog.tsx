import { useState, useEffect } from "react";
import {
  Action,
  ActionPanel,
  Detail,
  Toast,
  showToast,
  getPreferenceValues,
} from "@raycast/api";
import { updateChangelog } from "./utils/changelog";

interface Preferences {
  apiKey: string;
}

export default function UpdateChangelog() {
  const [isLoading, setIsLoading] = useState(true);
  const [output, setOutput] = useState("Starting changelog update...");
  const [success, setSuccess] = useState(false);
  const [entriesCount, setEntriesCount] = useState(0);
  
  const preferences = getPreferenceValues<Preferences>();
  
  useEffect(() => {
    async function fetchChangelog() {
      try {
        setOutput((prev) => prev + "\nConnecting to cursor.com...");
        
        const data = await updateChangelog(preferences.apiKey);
        
        setOutput((prev) => 
          prev + 
          "\nConnection successful!" + 
          "\nExtracting changelog data..." +
          `\nFound ${data.length} changelog entries.` +
          "\nChangelog database updated successfully!"
        );
        
        setEntriesCount(data.length);
        setSuccess(true);
        
        await showToast({
          style: Toast.Style.Success,
          title: "Changelog updated",
          message: `Found ${data.length} entries`,
        });
      } catch (error) {
        setOutput((prev) => prev + `\nError: ${error}`);
        setSuccess(false);
        
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to update changelog",
          message: String(error),
        });
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchChangelog();
  }, [preferences.apiKey]);
  
  // Format the markdown with the output log
  const markdown = `# Cursor Changelog Update ${success ? "✅" : ""}
  
\`\`\`
${output}
\`\`\`

${success ? `Successfully retrieved ${entriesCount} changelog entries.` : ""}
`;
  
  return (
    <Detail
      markdown={markdown}
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard
            title="Copy Log"
            content={output}
            shortcut={{ modifiers: ["cmd"], key: "c" }}
          />
          <Action
            title="Retry Update"
            shortcut={{ modifiers: ["cmd"], key: "r" }}
            onAction={() => {
              setIsLoading(true);
              setOutput("Restarting changelog update...");
              setSuccess(false);
              setEntriesCount(0);
              
              async function retryUpdate() {
                try {
                  setOutput((prev) => prev + "\nConnecting to cursor.com...");
                  
                  const data = await updateChangelog(preferences.apiKey);
                  
                  setOutput((prev) => 
                    prev + 
                    "\nConnection successful!" + 
                    "\nExtracting changelog data..." +
                    `\nFound ${data.length} changelog entries.` +
                    "\nChangelog database updated successfully!"
                  );
                  
                  setEntriesCount(data.length);
                  setSuccess(true);
                  
                  await showToast({
                    style: Toast.Style.Success,
                    title: "Changelog updated",
                    message: `Found ${data.length} entries`,
                  });
                } catch (error) {
                  setOutput((prev) => prev + `\nError: ${error}`);
                  setSuccess(false);
                  
                  await showToast({
                    style: Toast.Style.Failure,
                    title: "Failed to update changelog",
                    message: String(error),
                  });
                } finally {
                  setIsLoading(false);
                }
              }
              
              retryUpdate();
            }}
          />
        </ActionPanel>
      }
    />
  );
} 