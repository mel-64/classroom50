export const buttonFormSelector =
  ":matches(JSXElement[openingElement.name.name='form'], JSXElement:has(JSXAttribute[name.name='as'][value.value='form'])) JSXOpeningElement[name.name='Button']:not(:has(JSXAttribute[name.name=/^(type|as|href)$/]))"

export const buttonFormMessage =
  'A <Button> inside a <form> needs an explicit `type`: add type="submit" for the submit action or type="button" for a click handler. The <Button> default is "button", which silently disables implicit form submit.'
