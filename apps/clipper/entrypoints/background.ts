import { defineBackground } from "wxt/utils/define-background"
import { browser } from "wxt/browser"

export default defineBackground(() => {
  browser.contextMenus.create({
    id: "zilobase-clip-page",
    title: "Save page to Zilobase",
    contexts: ["page"],
  })
  browser.contextMenus.create({
    id: "zilobase-clip-selection",
    title: "Save selection to Zilobase",
    contexts: ["selection"],
  })

  browser.contextMenus.onClicked.addListener(() => {
    void browser.action.openPopup()
  })

  browser.commands.onCommand.addListener((command) => {
    if (command === "open-clipper" || command === "quick-clip") {
      void browser.action.openPopup()
    }
  })
})
