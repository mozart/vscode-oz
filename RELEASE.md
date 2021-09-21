
To release this extension on the vscode marketplace, you have to follow 
instructions from [visualstudio docs].

[visualstudio docs]: https://code.visualstudio.com/api/working-with-extensions/publishing-extension 

This organisation homepage is at https://dev.azure.com/mozart2

Create a PAT (personal access token) as per the above doc.
You can then use the PAT to publish the extension.

An example session:

```
~$ ./node_modules/vsce/out/vsce login mozart-oz
Personal Access Token for publisher 'mozart-oz': ****************************************************
 
The Personal Access Token verification succeeded for the publisher 'mozart-oz'.
 
 
~$ ./node_modules/vsce/out/vsce ls-publishers  
mozart-oz
 
 
~$ ./node_modules/vsce/out/vsce publish
Executing prepublish script 'npm run vscode:prepublish'...
 
> vscode-oz@1.1.0 vscode:prepublish /home/gmaudoux/projets/vscode-oz
> npm run compile
 
 
> vscode-oz@1.1.0 compile /home/gmaudoux/projets/vscode-oz
> tsc -p ./
 
 INFO  Publishing 'mozart-oz.vscode-oz v1.1.0'...
 INFO  Extension URL (might take a few minutes): https://marketplace.visualstudio.com/items?itemName=mozart-oz.vscode-oz
 INFO  Hub URL: https://marketplace.visualstudio.com/manage/publishers/mozart-oz/extensions/vscode-oz/hub
 DONE  Published mozart-oz.vscode-oz v1.1.0.
```

It may also be interesting to note that npm has an auto-increment feature that 
helps bumping version numbers. See `npm version [patch|minor|major]`.

The extension can also be published with `npm publish`. This is useless but has 
been done several times in the past and remains accessible on the npm registry.

