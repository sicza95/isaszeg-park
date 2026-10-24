# Publishing the prepared repository

The source archive contains the application and a `repository.bundle` file with the complete prepared Git history. The original `sicza95/isaszeg-park` initial commit is its parent, so publishing is a normal fast-forward when the remote has not changed.

The connected GitHub app must be installed on the repository owner's account and granted access to `sicza95/isaszeg-park`. Account authorization and repository installation are separate. If a write returns HTTP 403 (“Resource not accessible by integration”), check the installation's repository selection and requested write permissions. No credentials or access tokens belong in this project.

If you prefer to publish from your own computer, install Git and run these commands **from the extracted source folder containing `repository.bundle`**:

```sh
git clone repository.bundle isaszeg-park-restored
cd isaszeg-park-restored
git remote set-url origin https://github.com/sicza95/isaszeg-park.git
git push -u origin main
```

Use Git's normal sign-in prompt for your own account. Do not force push. If the remote changed in the meantime, fetch and integrate the new commits first.

After a successful push, the included GitHub Actions workflow tests and packages Windows, macOS and Linux applications. Its Linux job also runs the desktop playback smoke test. Download installers from the successful run's artifacts. Until that run completes, no built installer or completed desktop smoke result is being claimed.
