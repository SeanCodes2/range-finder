# Range Finder

GPS range finder PWA for setting shooting targets at a known distance. Set point A at the firing line, walk toward the target reading live distance, set point B, save the pair.

Plain HTML/JS, no build step. Hosted on Azure Static Web Apps (Free), deployed by GitHub Actions on push to `main`.

## Deploy (one time)

```sh
az group create -n rg-range-finder -l centralus
az deployment group create -g rg-range-finder -f infra/main.bicep
az staticwebapp secrets list -n swa-rangefinder -g rg-range-finder --query properties.apiKey -o tsv
gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN --repo SeanCodes2/range-finder
```

Then push to `main`. Open the SWA hostname on your phone and Add to Home Screen.
