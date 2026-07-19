import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { DJWorkspace } from '@/components/dj-workspace'
import { auth } from '@/lib/auth'
export default async function Page(){const session=await auth.api.getSession({headers:await headers()});if(!session?.user)redirect('/sign-in');return <DJWorkspace user={{name:session.user.name,email:session.user.email}}/>}
