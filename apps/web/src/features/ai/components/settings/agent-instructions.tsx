import * as React from "react";
import { toast } from "sonner";

import {
  type AiAgentProfileDetail,
  useUpdateAiAgentProfile,
  useWorkspaceAiModels
} from "@zilobase/features/ai-chat";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";

export function AgentInstructions({ agent }: { agent: AiAgentProfileDetail }) {
  const update = useUpdateAiAgentProfile(agent.id)
  const modelsQuery = useWorkspaceAiModels()
  const [name, setName] = React.useState(agent.name)
  const [description, setDescription] = React.useState(agent.description)
  const [instructions, setInstructions] = React.useState(agent.instructions)
  const [defaultModel, setDefaultModel] = React.useState(agent.defaultModel)

  React.useEffect(() => {
    setName(agent.name)
    setDescription(agent.description)
    setInstructions(agent.instructions)
    setDefaultModel(agent.defaultModel)
  }, [agent])

  const save = async () => {
    try {
      await update.mutateAsync({ defaultModel, description, instructions, name })
      toast.success("Agent saved.")
    } catch (error) {
      showError("Could not save agent", error)
    }
  }

  const canEdit = agent.role === "owner" || agent.role === "editor"
  return (
    <div className="grid gap-3">
      <Input disabled={!canEdit} onChange={(event) => setName(event.target.value)} value={name} />
      <Input
        disabled={!canEdit}
        maxLength={500}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="What this agent is for"
        value={description}
      />
      <Textarea
        className="min-h-40"
        disabled={!canEdit}
        maxLength={20_000}
        onChange={(event) => setInstructions(event.target.value)}
        placeholder="Instructions applied to every conversation with this agent"
        value={instructions}
      />
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Default model</span>
        <Select disabled={!canEdit} onValueChange={setDefaultModel} value={defaultModel}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto</SelectItem>
            {modelsQuery.data?.models.map((model) => (
              <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      {canEdit && (
        <Button className="w-fit" disabled={update.isPending} onClick={() => void save()} type="button">
          Save agent
        </Button>
      )}
    </div>
  )
}

function showError(title: string, error: unknown) {
  toast.error(title, {
    description: error instanceof Error ? error.message : "Try again.",
  })
}
